use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::str::FromStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use uuid::Uuid;

const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone)]
pub(crate) struct ProviderGatewayConfig {
    pub(crate) upstream_base_url: String,
    pub(crate) upstream_api_key: String,
    pub(crate) max_output_tokens: Option<u64>,
    pub(crate) supports_thinking: bool,
    pub(crate) supports_reasoning_effort: bool,
}

pub(crate) struct ProviderGatewayRuntime {
    pub(crate) base_url: String,
    pub(crate) access_token: String,
    pub(crate) shutdown: ProviderGatewayShutdown,
}

pub(crate) type ProviderGatewayShutdown = oneshot::Sender<()>;

pub(crate) async fn start_provider_gateway(
    config: ProviderGatewayConfig,
) -> Result<ProviderGatewayRuntime, String> {
    let upstream_base_url = config.upstream_base_url.trim().to_string();
    let upstream_api_key = config.upstream_api_key.trim().to_string();
    if upstream_base_url.is_empty() || upstream_api_key.is_empty() {
        return Err("Gateway requires provider base URL and key".to_string());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|err| format!("Failed to bind provider gateway: {err}"))?;
    let addr = listener
        .local_addr()
        .map_err(|err| format!("Failed to read provider gateway address: {err}"))?;
    let gateway_base_url = format!("http://{addr}/v1");
    let gateway_access_token = format!("codex-monitor-{}", Uuid::new_v4());
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let shutdown_requested = Arc::new(AtomicBool::new(false));
    let shutdown_requested_for_signal = Arc::clone(&shutdown_requested);
    tokio::spawn(async move {
        let _ = (&mut shutdown_rx).await;
        shutdown_requested_for_signal.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(addr).await;
    });
    let gateway_access_token_for_server = gateway_access_token.clone();
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            let Ok((stream, _peer)) = listener.accept().await else {
                break;
            };
            if shutdown_requested.load(Ordering::SeqCst) {
                break;
            };
            let client = client.clone();
            let upstream_base_url = upstream_base_url.clone();
            let upstream_api_key = upstream_api_key.clone();
            let gateway_access_token = gateway_access_token_for_server.clone();
            tokio::spawn(async move {
                let _ = handle_gateway_connection(
                    stream,
                    client,
                    upstream_base_url,
                    upstream_api_key,
                    gateway_access_token,
                    config.max_output_tokens,
                    config.supports_thinking,
                    config.supports_reasoning_effort,
                )
                .await;
            });
        }
    });
    Ok(ProviderGatewayRuntime {
        base_url: gateway_base_url,
        access_token: gateway_access_token,
        shutdown: shutdown_tx,
    })
}

async fn handle_gateway_connection(
    mut stream: TcpStream,
    client: reqwest::Client,
    upstream_base_url: String,
    upstream_api_key: String,
    gateway_access_token: String,
    max_output_tokens: Option<u64>,
    supports_thinking: bool,
    supports_reasoning_effort: bool,
) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    if !gateway_request_is_authorized(&request, &gateway_access_token) {
        return write_json_response(
            &mut stream,
            reqwest::StatusCode::UNAUTHORIZED,
            &json!({ "error": { "message": "Invalid gateway access token", "type": "authentication_error" } }),
        )
        .await;
    }
    if is_responses_path(&request.path) {
        return handle_responses_compat_request(
            &mut stream,
            client,
            upstream_base_url,
            upstream_api_key,
            request,
            max_output_tokens,
            supports_thinking,
            supports_reasoning_effort,
        )
        .await;
    }
    let is_chat_stream = is_chat_completions_streaming(&request);
    let upstream_url = build_upstream_url(&upstream_base_url, &request.path)?;
    let mut headers = HeaderMap::new();
    for (name, value) in request.headers {
        let lower = name.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "authorization" | "content-length" | "host" | "connection" | "accept-encoding"
        ) {
            continue;
        }
        if let (Ok(header_name), Ok(header_value)) =
            (HeaderName::from_str(&name), HeaderValue::from_str(&value))
        {
            headers.insert(header_name, header_value);
        }
    }
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "Invalid gateway request method".to_string())?;
    let response = client
        .request(method, upstream_url)
        .headers(headers)
        .bearer_auth(upstream_api_key)
        .body(request.body)
        .send()
        .await
        .map_err(|err| format!("Provider gateway upstream request failed: {err}"))?;
    if should_rewrite_chat_completions_stream(is_chat_stream, response.status(), response.headers())
    {
        write_chat_completions_stream(&mut stream, response).await
    } else {
        write_proxy_response(&mut stream, response).await
    }
}

fn gateway_request_is_authorized(request: &GatewayRequest, access_token: &str) -> bool {
    let expected = format!("Bearer {access_token}");
    request
        .headers
        .iter()
        .any(|(name, value)| name.eq_ignore_ascii_case("authorization") && value.trim() == expected)
}

async fn handle_responses_compat_request(
    stream: &mut TcpStream,
    client: reqwest::Client,
    upstream_base_url: String,
    upstream_api_key: String,
    request: GatewayRequest,
    max_output_tokens: Option<u64>,
    supports_thinking: bool,
    supports_reasoning_effort: bool,
) -> Result<(), String> {
    let body: Value = serde_json::from_slice(&request.body)
        .map_err(|_| "Gateway Responses request body is not valid JSON".to_string())?;
    let stream_response = body.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let chat_body = responses_request_to_chat_completions_with_reasoning(
        &body,
        max_output_tokens,
        supports_thinking,
        supports_reasoning_effort,
    )?;
    let upstream_url = build_upstream_url(&upstream_base_url, "/v1/chat/completions")?;
    let chat_body_bytes = serde_json::to_vec(&chat_body)
        .map_err(|_| "Failed to serialize chat completions request".to_string())?;
    let response = client
        .post(upstream_url)
        .bearer_auth(upstream_api_key)
        .header("content-type", "application/json")
        .body(chat_body_bytes)
        .send()
        .await
        .map_err(|err| format!("Provider gateway upstream request failed: {err}"))?;
    if !response.status().is_success() {
        return write_proxy_response(stream, response).await;
    }
    if stream_response {
        write_responses_stream_from_chat_stream(stream, response).await
    } else {
        let chat_response_text = response
            .text()
            .await
            .map_err(|_| "Failed to read chat completions response".to_string())?;
        let chat_response: Value = serde_json::from_str(&chat_response_text)
            .map_err(|_| "Failed to parse chat completions response".to_string())?;
        let response_body = chat_completion_to_response(&chat_response);
        write_json_response(stream, reqwest::StatusCode::OK, &response_body).await
    }
}

#[derive(Debug)]
struct GatewayRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

async fn read_http_request(stream: &mut TcpStream) -> Result<GatewayRequest, String> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|err| format!("Failed to read gateway request: {err}"))?;
        if read == 0 {
            return Err("Gateway request closed before headers".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_HEADER_BYTES {
            return Err("Gateway request headers are too large".to_string());
        }
        if let Some(index) = find_header_end(&buffer) {
            break index;
        }
    };

    let header_bytes = &buffer[..header_end];
    let header_text = std::str::from_utf8(header_bytes)
        .map_err(|_| "Gateway request headers are not UTF-8".to_string())?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "Gateway request line is missing".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "Gateway request method is missing".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "Gateway request path is missing".to_string())?
        .to_string();
    let mut headers = Vec::new();
    let mut content_length = 0usize;
    let mut expect_continue = false;
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim().to_string();
        if name.eq_ignore_ascii_case("content-length") {
            content_length = value
                .parse::<usize>()
                .map_err(|_| "Invalid gateway request content length".to_string())?;
            if content_length > MAX_BODY_BYTES {
                return Err("Gateway request body is too large".to_string());
            }
        }
        if name.eq_ignore_ascii_case("expect") && value.eq_ignore_ascii_case("100-continue") {
            expect_continue = true;
        }
        headers.push((name.trim().to_string(), value));
    }

    let body_start = header_end + 4;
    let mut body = buffer[body_start..].to_vec();
    if expect_continue && body.len() < content_length {
        stream
            .write_all(b"HTTP/1.1 100 Continue\r\n\r\n")
            .await
            .map_err(|err| format!("Failed to acknowledge gateway request body: {err}"))?;
    }
    while body.len() < content_length {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|err| format!("Failed to read gateway request body: {err}"))?;
        if read == 0 {
            return Err("Gateway request closed before body completed".to_string());
        }
        body.extend_from_slice(&chunk[..read]);
        if body.len() > MAX_BODY_BYTES {
            return Err("Gateway request body is too large".to_string());
        }
    }
    body.truncate(content_length);

    Ok(GatewayRequest {
        method,
        path,
        headers,
        body,
    })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

pub(crate) fn build_upstream_url(
    base_url: &str,
    request_path: &str,
) -> Result<reqwest::Url, String> {
    let trimmed_base = base_url.trim();
    let normalized_base = if trimmed_base.contains("://") {
        trimmed_base.to_string()
    } else {
        format!("https://{trimmed_base}")
    };
    let mut url = reqwest::Url::parse(&normalized_base)
        .map_err(|_| "Invalid gateway upstream base URL".to_string())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("Gateway upstream base URL must use HTTP or HTTPS".to_string());
    }
    let request_url = reqwest::Url::parse(&format!("http://gateway.local{request_path}"))
        .map_err(|_| "Invalid gateway request path".to_string())?;
    let base_path = url.path().trim_end_matches('/');
    let request_path = request_url.path().trim_start_matches('/');
    let request_path = request_path.strip_prefix("v1/").unwrap_or(request_path);
    let next_path = if base_path.is_empty() || base_path == "/" {
        format!("/v1/{request_path}")
    } else {
        format!("{base_path}/{request_path}")
    };
    url.set_path(&next_path);
    url.set_query(request_url.query());
    Ok(url)
}

fn is_responses_path(path: &str) -> bool {
    reqwest::Url::parse(&format!("http://gateway.local{path}"))
        .ok()
        .map(|url| url.path().trim_end_matches('/') == "/v1/responses")
        .unwrap_or(false)
}

fn is_chat_completions_streaming(request: &GatewayRequest) -> bool {
    if request.method != "POST" {
        return false;
    }
    let path_ok = reqwest::Url::parse(&format!("http://gateway.local{}", request.path))
        .ok()
        .map(|url| url.path().trim_end_matches('/') == "/v1/chat/completions")
        .unwrap_or(false);
    if !path_ok {
        return false;
    }
    let Ok(body) = serde_json::from_slice::<serde_json::Value>(&request.body) else {
        return false;
    };
    body.get("stream").and_then(Value::as_bool).unwrap_or(false)
}

fn chat_stream_has_finish_reason(value: &serde_json::Value) -> bool {
    value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(|fr| fr.as_str())
        .map(|fr| !fr.is_empty())
        .unwrap_or(false)
}

fn should_rewrite_chat_completions_stream(
    request_is_stream: bool,
    status: reqwest::StatusCode,
    headers: &HeaderMap,
) -> bool {
    request_is_stream
        && status.is_success()
        && headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .map(str::trim)
            .map(|value| value.eq_ignore_ascii_case("text/event-stream"))
            .unwrap_or(false)
}

pub(crate) fn responses_request_to_chat_completions(
    body: &Value,
    max_output_tokens: Option<u64>,
) -> Result<Value, String> {
    responses_request_to_chat_completions_with_reasoning(body, max_output_tokens, false, false)
}

fn responses_request_to_chat_completions_with_reasoning(
    body: &Value,
    max_output_tokens: Option<u64>,
    supports_thinking: bool,
    supports_reasoning_effort: bool,
) -> Result<Value, String> {
    let model = body
        .get("model")
        .cloned()
        .ok_or_else(|| "Responses request missing model".to_string())?;
    let mut messages = Vec::new();
    if let Some(instructions) = body
        .get("instructions")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        messages.push(json!({ "role": "system", "content": instructions }));
    }
    append_response_input_messages(body.get("input"), &mut messages);
    if messages.is_empty() {
        messages.push(json!({ "role": "user", "content": "" }));
    }

    let mut out = json!({
        "model": model,
        "messages": messages,
        "stream": body.get("stream").and_then(Value::as_bool).unwrap_or(false),
    });
    copy_generation_field(body, &mut out, "temperature", "temperature");
    copy_generation_field(body, &mut out, "top_p", "top_p");
    copy_generation_field(body, &mut out, "max_output_tokens", "max_tokens");
    apply_max_output_tokens_cap(&mut out, max_output_tokens);
    copy_reasoning_fields(body, &mut out, supports_thinking, supports_reasoning_effort);
    copy_function_tools(body, &mut out);
    Ok(out)
}

fn copy_reasoning_fields(
    source: &Value,
    target: &mut Value,
    supports_thinking: bool,
    supports_reasoning_effort: bool,
) {
    let Some(reasoning) = source.get("reasoning") else {
        return;
    };
    let effort = reasoning
        .get("effort")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let enabled = effort
        .map(|value| {
            !matches!(
                value.to_ascii_lowercase().as_str(),
                "none" | "off" | "disabled"
            )
        })
        .unwrap_or(!reasoning.is_null());
    let Some(map) = target.as_object_mut() else {
        return;
    };
    if supports_thinking {
        map.insert(
            "thinking".to_string(),
            json!({ "type": if enabled { "enabled" } else { "disabled" } }),
        );
    }
    if supports_reasoning_effort && enabled {
        if let Some(effort) = effort {
            map.insert(
                "reasoning_effort".to_string(),
                Value::String(effort.to_string()),
            );
        }
    }
}

fn apply_max_output_tokens_cap(target: &mut Value, max_output_tokens: Option<u64>) {
    let Some(cap) = max_output_tokens.filter(|value| *value > 0) else {
        return;
    };
    let requested = target.get("max_tokens").and_then(Value::as_u64);
    let effective = requested.map(|value| value.min(cap)).unwrap_or(cap);
    if let Some(map) = target.as_object_mut() {
        map.insert("max_tokens".to_string(), Value::from(effective));
    }
}

fn copy_generation_field(source: &Value, target: &mut Value, source_key: &str, target_key: &str) {
    if let Some(value) = source.get(source_key).cloned() {
        if let Some(map) = target.as_object_mut() {
            map.insert(target_key.to_string(), value);
        }
    }
}

fn copy_function_tools(source: &Value, target: &mut Value) {
    let tools = source
        .get("tools")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|tool| {
                    let kind = tool.get("type").and_then(Value::as_str)?;
                    if kind != "function" {
                        return None;
                    }
                    let function = if let Some(function) = tool.get("function") {
                        function.clone()
                    } else {
                        json!({
                            "name": tool.get("name")?,
                            "description": tool.get("description").cloned().unwrap_or(Value::Null),
                            "parameters": tool.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                        })
                    };
                    Some(json!({ "type": "function", "function": function }))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !tools.is_empty() {
        if let Some(map) = target.as_object_mut() {
            map.insert("tools".to_string(), Value::Array(tools));
        }
    }
}

fn append_response_input_messages(input: Option<&Value>, messages: &mut Vec<Value>) {
    let Some(input) = input else {
        return;
    };
    if let Some(text) = input.as_str() {
        messages.push(json!({ "role": "user", "content": text }));
        return;
    }
    let Some(items) = input.as_array() else {
        return;
    };
    for item in items {
        match item.get("type").and_then(Value::as_str) {
            Some("function_call") => {
                let Some(name) = item.get("name").and_then(Value::as_str) else {
                    continue;
                };
                let call_id = item
                    .get("call_id")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or("call_gateway");
                let arguments = normalize_historical_function_arguments(item.get("arguments"));
                messages.push(json!({
                    "role": "assistant",
                    "content": Value::Null,
                    "tool_calls": [{
                        "id": call_id,
                        "type": "function",
                        "function": { "name": name, "arguments": arguments }
                    }]
                }));
                continue;
            }
            Some("function_call_output") => {
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                let output = item
                    .get("output")
                    .map(response_tool_output_to_string)
                    .unwrap_or_default();
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": output
                }));
                continue;
            }
            _ => {}
        }
        if let Some(role) = item.get("role").and_then(Value::as_str) {
            let content = response_content_to_chat_content(item.get("content"));
            messages.push(json!({ "role": normalize_chat_role(role), "content": content }));
        }
    }
}

fn normalize_historical_function_arguments(arguments: Option<&Value>) -> String {
    match arguments {
        Some(Value::Object(object)) => {
            serde_json::to_string(object).unwrap_or_else(|_| "{}".into())
        }
        Some(Value::String(raw)) => match serde_json::from_str::<Value>(raw) {
            Ok(Value::Object(_)) => raw.clone(),
            _ => "{}".to_string(),
        },
        _ => "{}".to_string(),
    }
}

fn response_tool_output_to_string(output: &Value) -> String {
    output
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| serde_json::to_string(output).unwrap_or_default())
}

fn normalize_chat_role(role: &str) -> &str {
    match role {
        "system" | "developer" => "system",
        "assistant" => "assistant",
        "tool" => "tool",
        _ => "user",
    }
}

fn response_content_to_chat_content(content: Option<&Value>) -> Value {
    let Some(content) = content else {
        return Value::String(String::new());
    };
    if content.is_string() {
        return content.clone();
    }
    let Some(items) = content.as_array() else {
        return Value::String(String::new());
    };
    let text = items
        .iter()
        .filter_map(|part| {
            part.get("text")
                .or_else(|| part.get("input_text"))
                .and_then(Value::as_str)
        })
        .collect::<Vec<_>>()
        .join("");
    Value::String(text)
}

pub(crate) fn chat_completion_to_response(chat_response: &Value) -> Value {
    let id = format_response_id(chat_response.get("id").and_then(Value::as_str));
    let created_at = chat_response
        .get("created")
        .and_then(Value::as_i64)
        .unwrap_or_else(now_unix_seconds);
    let model = chat_response
        .get("model")
        .cloned()
        .unwrap_or_else(|| Value::String("unknown".to_string()));
    let message = chat_response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"));
    let output_text = message
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut output = Vec::new();
    if !output_text.is_empty() {
        output.push(json!({
            "id": format!("msg_{}", unique_suffix()),
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [{
                "type": "output_text",
                "text": output_text,
                "annotations": []
            }]
        }));
    }
    if let Some(tool_calls) = message
        .and_then(|message| message.get("tool_calls"))
        .and_then(Value::as_array)
    {
        output.extend(
            tool_calls
                .iter()
                .filter_map(chat_tool_call_to_response_item),
        );
    }
    json!({
        "id": id,
        "object": "response",
        "created_at": created_at,
        "status": "completed",
        "model": model,
        "output": output,
        "output_text": output_text,
        "usage": chat_response.get("usage").cloned().unwrap_or(Value::Null),
    })
}

fn chat_tool_call_to_response_item(tool_call: &Value) -> Option<Value> {
    let function = tool_call.get("function")?;
    let name = function.get("name")?.as_str()?;
    let arguments = function
        .get("arguments")
        .and_then(Value::as_str)
        .unwrap_or("{}");
    let call_id = tool_call
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("call_gateway");
    Some(json!({
        "id": format!("fc_{}", unique_suffix()),
        "type": "function_call",
        "status": "completed",
        "call_id": call_id,
        "name": name,
        "arguments": arguments
    }))
}

#[derive(Default)]
struct StreamingToolCall {
    item_id: String,
    call_id: String,
    name: String,
    arguments: String,
    added: bool,
}

async fn write_responses_stream_from_chat_stream(
    stream: &mut TcpStream,
    response: reqwest::Response,
) -> Result<(), String> {
    write_sse_headers(stream, reqwest::StatusCode::OK).await?;
    let response_id = format!("resp_{}", unique_suffix());
    let model = "gateway";
    write_sse_event(
        stream,
        "response.created",
        json!({
            "type": "response.created",
            "response": {
                "id": response_id,
                "object": "response",
                "created_at": now_unix_seconds(),
                "status": "in_progress",
                "model": model,
                "output": []
            }
        }),
    )
    .await?;
    let mut accumulated = String::new();
    let mut message_id: Option<String> = None;
    let mut tool_calls = BTreeMap::<usize, StreamingToolCall>::new();
    let mut pending = String::new();
    let mut pending_utf8 = Vec::new();
    let mut body = response.bytes_stream();
    while let Some(chunk_result) = body.next().await {
        let chunk = chunk_result
            .map_err(|err| format!("Failed to read upstream chat completions stream: {err}"))?;
        append_utf8_stream_chunk(&mut pending, &mut pending_utf8, &chunk)?;
        while let Some((raw_event, rest)) = split_next_sse_event(&pending) {
            pending = rest;
            for data in parse_sse_data_lines(&raw_event) {
                if data.trim() == "[DONE]" {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<Value>(&data) else {
                    continue;
                };
                if let Some(delta) = chat_stream_delta_text(&value) {
                    let message_id = ensure_streaming_message(stream, &mut message_id, 0).await?;
                    accumulated.push_str(&delta);
                    write_sse_event(
                        stream,
                        "response.output_text.delta",
                        json!({
                            "type": "response.output_text.delta",
                            "item_id": message_id,
                            "output_index": 0,
                            "content_index": 0,
                            "delta": delta,
                        }),
                    )
                    .await?;
                }
                append_chat_stream_tool_calls(
                    stream,
                    &value,
                    &mut tool_calls,
                    message_id.is_some(),
                )
                .await?;
            }
        }
    }
    finish_utf8_stream(&pending_utf8)?;

    if let Some(message_id) = message_id.as_deref() {
        write_sse_event(
            stream,
            "response.output_text.done",
            json!({
                "type": "response.output_text.done",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": accumulated,
            }),
        )
        .await?;
    }
    for (index, tool_call) in &tool_calls {
        let output_index = index + usize::from(message_id.is_some());
        write_sse_event(
            stream,
            "response.function_call_arguments.done",
            json!({
                "type": "response.function_call_arguments.done",
                "item_id": tool_call.item_id,
                "output_index": output_index,
                "arguments": tool_call.arguments,
            }),
        )
        .await?;
        write_sse_event(
            stream,
            "response.output_item.done",
            json!({
                "type": "response.output_item.done",
                "output_index": output_index,
                "item": streaming_tool_call_item(tool_call, "completed"),
            }),
        )
        .await?;
    }
    let mut completed_output = Vec::new();
    if let Some(message_id) = message_id.as_deref() {
        completed_output.push(json!({
            "id": message_id,
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [{ "type": "output_text", "text": accumulated, "annotations": [] }]
        }));
    }
    completed_output.extend(
        tool_calls
            .values()
            .map(|tool_call| streaming_tool_call_item(tool_call, "completed")),
    );
    write_sse_event(
        stream,
        "response.completed",
        json!({
            "type": "response.completed",
            "response": {
                "id": response_id,
                "object": "response",
                "created_at": now_unix_seconds(),
                "status": "completed",
                "model": model,
                "output": completed_output,
                "output_text": accumulated
            }
        }),
    )
    .await?;
    stream
        .write_all(b"data: [DONE]\n\n")
        .await
        .map_err(|err| format!("Failed to finish Responses stream: {err}"))?;
    Ok(())
}

async fn ensure_streaming_message<'a>(
    stream: &mut TcpStream,
    message_id: &'a mut Option<String>,
    output_index: usize,
) -> Result<&'a str, String> {
    if message_id.is_none() {
        let id = format!("msg_{}", unique_suffix());
        write_sse_event(
            stream,
            "response.output_item.added",
            json!({
                "type": "response.output_item.added",
                "output_index": output_index,
                "item": {
                    "id": id,
                    "type": "message",
                    "status": "in_progress",
                    "role": "assistant",
                    "content": []
                }
            }),
        )
        .await?;
        write_sse_event(
            stream,
            "response.content_part.added",
            json!({
                "type": "response.content_part.added",
                "item_id": id,
                "output_index": output_index,
                "content_index": 0,
                "part": { "type": "output_text", "text": "", "annotations": [] }
            }),
        )
        .await?;
        *message_id = Some(id);
    }
    Ok(message_id.as_deref().unwrap_or_default())
}

async fn append_chat_stream_tool_calls(
    stream: &mut TcpStream,
    value: &Value,
    tool_calls: &mut BTreeMap<usize, StreamingToolCall>,
    has_message: bool,
) -> Result<(), String> {
    let deltas = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("tool_calls"))
        .and_then(Value::as_array);
    let Some(deltas) = deltas else {
        return Ok(());
    };
    for delta in deltas {
        let index = delta.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
        let state = tool_calls
            .entry(index)
            .or_insert_with(|| StreamingToolCall {
                item_id: format!("fc_{}", unique_suffix()),
                ..StreamingToolCall::default()
            });
        if let Some(call_id) = delta.get("id").and_then(Value::as_str) {
            state.call_id = call_id.to_string();
        }
        if let Some(function) = delta.get("function") {
            if let Some(name) = function.get("name").and_then(Value::as_str) {
                state.name.push_str(name);
            }
            if let Some(arguments) = function.get("arguments").and_then(Value::as_str) {
                state.arguments.push_str(arguments);
                let output_index = index + usize::from(has_message);
                if !state.added {
                    write_sse_event(
                        stream,
                        "response.output_item.added",
                        json!({
                            "type": "response.output_item.added",
                            "output_index": output_index,
                            "item": streaming_tool_call_item(state, "in_progress"),
                        }),
                    )
                    .await?;
                    state.added = true;
                }
                write_sse_event(
                    stream,
                    "response.function_call_arguments.delta",
                    json!({
                        "type": "response.function_call_arguments.delta",
                        "item_id": state.item_id,
                        "output_index": output_index,
                        "delta": arguments,
                    }),
                )
                .await?;
            }
        }
    }
    Ok(())
}

fn streaming_tool_call_item(tool_call: &StreamingToolCall, status: &str) -> Value {
    json!({
        "id": tool_call.item_id,
        "type": "function_call",
        "status": status,
        "call_id": tool_call.call_id,
        "name": tool_call.name,
        "arguments": tool_call.arguments
    })
}

async fn write_chat_completions_stream(
    stream: &mut TcpStream,
    response: reqwest::Response,
) -> Result<(), String> {
    let status = response.status();
    let reason = status.canonical_reason().unwrap_or("OK");
    let mut head = format!("HTTP/1.1 {} {reason}\r\n", status.as_u16());
    for (name, value) in response.headers() {
        let lower = name.as_str().to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "content-length" | "connection" | "transfer-encoding"
        ) {
            continue;
        }
        if let Ok(value) = value.to_str() {
            head.push_str(name.as_str());
            head.push_str(": ");
            head.push_str(value);
            head.push_str("\r\n");
        }
    }
    head.push_str("Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|err| format!("Failed to write gateway response headers: {err}"))?;

    let mut body = response.bytes_stream();
    let mut pending = String::new();
    let mut pending_utf8 = Vec::new();
    let mut saw_finish_reason = false;
    let mut saw_done = false;

    loop {
        let chunk = match body.next().await {
            Some(Ok(chunk)) => chunk,
            Some(Err(err)) => {
                return Err(format!(
                    "Failed to read upstream chat completions stream: {err}"
                ));
            }
            None => break,
        };
        if chunk.is_empty() {
            continue;
        }
        append_utf8_stream_chunk(&mut pending, &mut pending_utf8, &chunk)?;
        while let Some((raw_event, rest)) = split_next_sse_event(&pending) {
            pending = rest;
            write_chat_stream_event(stream, &raw_event, &mut saw_finish_reason, &mut saw_done)
                .await?;
        }
    }
    finish_utf8_stream(&pending_utf8)?;

    finish_chat_completions_stream(stream, &mut pending, &mut saw_finish_reason, &mut saw_done)
        .await?;
    Ok(())
}

async fn finish_chat_completions_stream(
    stream: &mut TcpStream,
    pending: &mut String,
    saw_finish_reason: &mut bool,
    saw_done: &mut bool,
) -> Result<(), String> {
    if !pending.is_empty() {
        write_chat_stream_event(stream, pending, saw_finish_reason, saw_done).await?;
        pending.clear();
    }
    if !*saw_finish_reason {
        write_http_chunk(stream, synthetic_chat_finish_event()).await?;
        *saw_finish_reason = true;
    }
    if !*saw_done {
        write_http_chunk(stream, b"data: [DONE]\n\n").await?;
        *saw_done = true;
    }
    stream
        .write_all(b"0\r\n\r\n")
        .await
        .map_err(|err| format!("Failed to finish gateway response: {err}"))?;
    Ok(())
}

async fn write_chat_stream_event(
    stream: &mut TcpStream,
    raw_event: &str,
    saw_finish_reason: &mut bool,
    saw_done: &mut bool,
) -> Result<(), String> {
    let (event_has_finish_reason, event_is_done) = chat_stream_event_flags(raw_event);
    if event_is_done && !*saw_finish_reason {
        write_http_chunk(stream, synthetic_chat_finish_event()).await?;
        *saw_finish_reason = true;
    }
    let payload = format!("{raw_event}\n\n");
    write_http_chunk(stream, payload.as_bytes()).await?;
    *saw_finish_reason |= event_has_finish_reason;
    *saw_done |= event_is_done;
    Ok(())
}

fn chat_stream_event_flags(raw_event: &str) -> (bool, bool) {
    let mut has_finish_reason = false;
    let mut is_done = false;
    for data in parse_sse_data_lines(raw_event) {
        if data.trim() == "[DONE]" {
            is_done = true;
        } else if let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) {
            has_finish_reason |= chat_stream_has_finish_reason(&value);
        }
    }
    (has_finish_reason, is_done)
}

fn synthetic_chat_finish_event() -> &'static [u8] {
    b"data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\",\"index\":0}]}\n\n"
}

async fn write_http_chunk(stream: &mut TcpStream, chunk: &[u8]) -> Result<(), String> {
    let prefix = format!("{:x}\r\n", chunk.len());
    stream
        .write_all(prefix.as_bytes())
        .await
        .map_err(|err| format!("Failed to write gateway response chunk: {err}"))?;
    stream
        .write_all(chunk)
        .await
        .map_err(|err| format!("Failed to write gateway response chunk: {err}"))?;
    stream
        .write_all(b"\r\n")
        .await
        .map_err(|err| format!("Failed to write gateway response chunk: {err}"))
}

fn split_next_sse_event(pending: &str) -> Option<(String, String)> {
    let lf = pending.find("\n\n");
    let crlf = pending.find("\r\n\r\n");
    match (lf, crlf) {
        (Some(lf), Some(crlf)) if crlf < lf => {
            Some((pending[..crlf].to_string(), pending[crlf + 4..].to_string()))
        }
        (Some(lf), _) => Some((pending[..lf].to_string(), pending[lf + 2..].to_string())),
        (None, Some(crlf)) => Some((pending[..crlf].to_string(), pending[crlf + 4..].to_string())),
        (None, None) => None,
    }
}

fn append_utf8_stream_chunk(
    output: &mut String,
    pending_bytes: &mut Vec<u8>,
    chunk: &[u8],
) -> Result<(), String> {
    pending_bytes.extend_from_slice(chunk);
    loop {
        match std::str::from_utf8(pending_bytes) {
            Ok(text) => {
                output.push_str(text);
                pending_bytes.clear();
                return Ok(());
            }
            Err(error) if error.valid_up_to() > 0 => {
                let valid_up_to = error.valid_up_to();
                let text = std::str::from_utf8(&pending_bytes[..valid_up_to])
                    .map_err(|_| "Invalid UTF-8 in provider stream".to_string())?;
                output.push_str(text);
                pending_bytes.drain(..valid_up_to);
            }
            Err(error) if error.error_len().is_none() => return Ok(()),
            Err(_) => return Err("Invalid UTF-8 in provider stream".to_string()),
        }
    }
}

fn finish_utf8_stream(pending_bytes: &[u8]) -> Result<(), String> {
    if pending_bytes.is_empty() {
        Ok(())
    } else {
        Err("Provider stream ended with incomplete UTF-8".to_string())
    }
}

fn parse_sse_data_lines(raw_event: &str) -> Vec<String> {
    raw_event
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(|line| line.trim_start().to_string())
        .collect()
}

fn chat_stream_delta_text(value: &Value) -> Option<String> {
    value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| {
            delta
                .get("content")
                .or_else(|| delta.get("reasoning_content"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
}

async fn write_json_response(
    stream: &mut TcpStream,
    status: reqwest::StatusCode,
    body: &Value,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(body).map_err(|err| err.to_string())?;
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        status.as_u16(),
        status.canonical_reason().unwrap_or("OK"),
        bytes.len()
    );
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|err| format!("Failed to write JSON response headers: {err}"))?;
    stream
        .write_all(&bytes)
        .await
        .map_err(|err| format!("Failed to write JSON response body: {err}"))?;
    Ok(())
}

async fn write_sse_headers(
    stream: &mut TcpStream,
    status: reqwest::StatusCode,
) -> Result<(), String> {
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        status.as_u16(),
        status.canonical_reason().unwrap_or("OK"),
    );
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|err| format!("Failed to write SSE response headers: {err}"))
}

async fn write_sse_event(stream: &mut TcpStream, event: &str, data: Value) -> Result<(), String> {
    let data = serde_json::to_string(&data).map_err(|err| err.to_string())?;
    let payload = format!("event: {event}\ndata: {data}\n\n");
    stream
        .write_all(payload.as_bytes())
        .await
        .map_err(|err| format!("Failed to write SSE event: {err}"))
}

fn format_response_id(source: Option<&str>) -> String {
    source
        .map(|id| format!("resp_{id}"))
        .unwrap_or_else(|| format!("resp_{}", unique_suffix()))
}

fn unique_suffix() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or_default()
}

async fn write_proxy_response(
    stream: &mut TcpStream,
    response: reqwest::Response,
) -> Result<(), String> {
    let status = response.status();
    let reason = status.canonical_reason().unwrap_or("OK");
    let mut head = format!("HTTP/1.1 {} {reason}\r\n", status.as_u16());
    for (name, value) in response.headers() {
        let lower = name.as_str().to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "content-length" | "connection" | "transfer-encoding"
        ) {
            continue;
        }
        if let Ok(value) = value.to_str() {
            head.push_str(name.as_str());
            head.push_str(": ");
            head.push_str(value);
            head.push_str("\r\n");
        }
    }
    head.push_str("Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|err| format!("Failed to write gateway response headers: {err}"))?;

    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk =
            chunk.map_err(|err| format!("Failed to read gateway upstream stream: {err}"))?;
        if chunk.is_empty() {
            continue;
        }
        let prefix = format!("{:x}\r\n", chunk.len());
        stream
            .write_all(prefix.as_bytes())
            .await
            .map_err(|err| format!("Failed to write gateway response chunk: {err}"))?;
        stream
            .write_all(&chunk)
            .await
            .map_err(|err| format!("Failed to write gateway response chunk: {err}"))?;
        stream
            .write_all(b"\r\n")
            .await
            .map_err(|err| format!("Failed to write gateway response chunk: {err}"))?;
    }
    stream
        .write_all(b"0\r\n\r\n")
        .await
        .map_err(|err| format!("Failed to finish gateway response: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        append_utf8_stream_chunk, build_upstream_url, chat_completion_to_response,
        chat_stream_event_flags, finish_utf8_stream, gateway_request_is_authorized,
        is_chat_completions_streaming, read_http_request, responses_request_to_chat_completions,
        responses_request_to_chat_completions_with_reasoning,
        should_rewrite_chat_completions_stream, split_next_sse_event, start_provider_gateway,
        write_chat_completions_stream, write_responses_stream_from_chat_stream, GatewayRequest,
        ProviderGatewayConfig,
    };
    use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
    use reqwest::StatusCode;
    use serde_json::json;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    async fn truncated_event_stream_response() -> reqwest::Response {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 1024];
            let _ = stream.read(&mut request).await;
            let body = b"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n";
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\n\r\n",
                body.len() + 64,
            );
            stream.write_all(head.as_bytes()).await.unwrap();
            stream.write_all(body).await.unwrap();
        });
        reqwest::get(format!("http://{addr}/stream")).await.unwrap()
    }

    async fn downstream_pair() -> (TcpStream, TcpStream) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let client = TcpStream::connect(addr).await.unwrap();
        let (server, _) = listener.accept().await.unwrap();
        (server, client)
    }

    #[test]
    fn truncated_responses_stream_does_not_report_completion() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let response = truncated_event_stream_response().await;
            let (mut server, mut client) = downstream_pair().await;
            let writer = tokio::spawn(async move {
                write_responses_stream_from_chat_stream(&mut server, response).await
            });
            let mut output = Vec::new();
            client.read_to_end(&mut output).await.unwrap();
            assert!(writer.await.unwrap().is_err());
            assert!(!String::from_utf8_lossy(&output).contains("response.completed"));
        });
    }

    #[test]
    fn truncated_chat_stream_does_not_report_done() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let response = truncated_event_stream_response().await;
            let (mut server, mut client) = downstream_pair().await;
            let writer =
                tokio::spawn(
                    async move { write_chat_completions_stream(&mut server, response).await },
                );
            let mut output = Vec::new();
            client.read_to_end(&mut output).await.unwrap();
            assert!(writer.await.unwrap().is_err());
            assert!(!String::from_utf8_lossy(&output).contains("data: [DONE]"));
        });
    }

    #[test]
    fn gateway_acknowledges_expect_continue_before_reading_body() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                read_http_request(&mut stream).await.unwrap()
            });
            let mut client = TcpStream::connect(addr).await.unwrap();
            client
                .write_all(
                    b"POST /v1/responses HTTP/1.1\r\nHost: localhost\r\nContent-Length: 2\r\nExpect: 100-continue\r\n\r\n",
                )
                .await
                .unwrap();
            let mut interim = [0u8; 25];
            tokio::time::timeout(Duration::from_millis(250), client.read_exact(&mut interim))
                .await
                .expect("gateway should acknowledge Expect before waiting for the body")
                .unwrap();
            assert_eq!(&interim, b"HTTP/1.1 100 Continue\r\n\r\n");
            client.write_all(b"{}").await.unwrap();
            let request = server.await.unwrap();
            assert_eq!(request.body, b"{}");
        });
    }

    #[test]
    fn gateway_upstream_url_preserves_provider_v1_path() {
        let url = build_upstream_url("https://api.deepseek.com/v1", "/v1/chat/completions")
            .expect("url")
            .to_string();

        assert_eq!(url, "https://api.deepseek.com/v1/chat/completions");
    }

    #[test]
    fn gateway_upstream_url_defaults_bare_host_to_v1() {
        let url = build_upstream_url("api.example.com", "/v1/models?limit=20")
            .expect("url")
            .to_string();

        assert_eq!(url, "https://api.example.com/v1/models?limit=20");
    }

    #[test]
    fn gateway_rejects_missing_or_wrong_access_token() {
        let mut request = GatewayRequest {
            method: "POST".to_string(),
            path: "/v1/responses".to_string(),
            headers: Vec::new(),
            body: Vec::new(),
        };

        assert!(!gateway_request_is_authorized(&request, "secret"));
        request
            .headers
            .push(("Authorization".to_string(), "Bearer wrong".to_string()));
        assert!(!gateway_request_is_authorized(&request, "secret"));
        request.headers[0].1 = "Bearer secret".to_string();
        assert!(gateway_request_is_authorized(&request, "secret"));
    }

    #[test]
    fn detects_streaming_chat_completions_requests() {
        let request = GatewayRequest {
            method: "POST".to_string(),
            path: "/v1/chat/completions/?trace=1".to_string(),
            headers: Vec::new(),
            body: br#"{"stream":true}"#.to_vec(),
        };

        assert!(is_chat_completions_streaming(&request));

        let non_streaming = GatewayRequest {
            body: br#"{"stream":false}"#.to_vec(),
            ..request
        };
        assert!(!is_chat_completions_streaming(&non_streaming));
    }

    #[test]
    fn detects_chat_stream_finish_and_done_events() {
        assert_eq!(
            chat_stream_event_flags(r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}]}"#,),
            (true, false),
        );
        assert_eq!(chat_stream_event_flags("data: [DONE]"), (false, true));
    }

    #[test]
    fn rewrites_only_successful_event_stream_responses() {
        let mut event_stream_headers = HeaderMap::new();
        event_stream_headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("text/event-stream; charset=utf-8"),
        );
        assert!(should_rewrite_chat_completions_stream(
            true,
            StatusCode::OK,
            &event_stream_headers,
        ));

        let mut json_headers = HeaderMap::new();
        json_headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        assert!(!should_rewrite_chat_completions_stream(
            true,
            StatusCode::UNAUTHORIZED,
            &json_headers,
        ));
        assert!(!should_rewrite_chat_completions_stream(
            true,
            StatusCode::OK,
            &json_headers,
        ));
    }

    #[test]
    fn responses_request_maps_text_input_to_chat_completions() {
        let chat = responses_request_to_chat_completions(
            &json!({
                "model": "deepseek-chat",
                "instructions": "Be concise.",
                "input": [{
                    "role": "user",
                    "content": [{ "type": "input_text", "text": "hello" }]
                }],
                "stream": true,
                "max_output_tokens": 1024,
                "tools": [{
                    "type": "function",
                    "name": "lookup",
                    "description": "lookup data",
                    "parameters": { "type": "object", "properties": {} }
                }, {
                    "type": "web_search_preview"
                }]
            }),
            None,
        )
        .expect("chat body");

        assert_eq!(
            chat,
            json!({
                "model": "deepseek-chat",
                "messages": [
                    { "role": "system", "content": "Be concise." },
                    { "role": "user", "content": "hello" }
                ],
                "stream": true,
                "max_tokens": 1024,
                "tools": [{
                    "type": "function",
                    "function": {
                        "name": "lookup",
                        "description": "lookup data",
                        "parameters": { "type": "object", "properties": {} }
                    }
                }]
            })
        );
    }

    #[test]
    fn responses_request_maps_function_call_history_to_chat_messages() {
        let chat = responses_request_to_chat_completions(
            &json!({
                "model": "deepseek-chat",
                "input": [{
                    "type": "function_call",
                    "call_id": "call_123",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"pwd\"}"
                }, {
                    "type": "function_call_output",
                    "call_id": "call_123",
                    "output": "D:/Project/ThreadFleet"
                }]
            }),
            None,
        )
        .expect("chat body");

        assert_eq!(chat["messages"][0]["role"], "assistant");
        assert_eq!(chat["messages"][0]["tool_calls"][0]["id"], "call_123");
        assert_eq!(
            chat["messages"][0]["tool_calls"][0]["function"]["name"],
            "shell_command"
        );
        assert_eq!(
            chat["messages"][0]["tool_calls"][0]["function"]["arguments"],
            "{\"command\":\"pwd\"}"
        );
        assert_eq!(chat["messages"][1]["role"], "tool");
        assert_eq!(chat["messages"][1]["tool_call_id"], "call_123");
        assert_eq!(chat["messages"][1]["content"], "D:/Project/ThreadFleet");
    }

    #[test]
    fn responses_request_sanitizes_invalid_historical_function_arguments() {
        let chat = responses_request_to_chat_completions(
            &json!({
                "model": "deepseek-chat",
                "input": [{
                    "type": "function_call",
                    "call_id": "call_invalid",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"unterminated"
                }, {
                    "type": "function_call_output",
                    "call_id": "call_invalid",
                    "output": "failed to parse function arguments"
                }]
            }),
            None,
        )
        .expect("chat body");

        let arguments = chat["messages"][0]["tool_calls"][0]["function"]["arguments"]
            .as_str()
            .expect("arguments string");
        assert!(matches!(
            serde_json::from_str::<serde_json::Value>(arguments),
            Ok(serde_json::Value::Object(_))
        ));
    }

    #[test]
    fn responses_request_maps_configured_chat_reasoning_fields() {
        let chat = responses_request_to_chat_completions_with_reasoning(
            &json!({
                "model": "deepseek-reasoner",
                "input": "hello",
                "reasoning": { "effort": "high" }
            }),
            None,
            true,
            true,
        )
        .expect("chat body");

        assert_eq!(chat["thinking"], json!({ "type": "enabled" }));
        assert_eq!(chat["reasoning_effort"], "high");
    }

    #[test]
    fn responses_request_applies_profile_output_token_cap() {
        let capped = responses_request_to_chat_completions(
            &json!({
                "model": "deepseek-chat",
                "input": "hello",
                "max_output_tokens": 16_384
            }),
            Some(8_192),
        )
        .expect("capped body");
        assert_eq!(capped["max_tokens"], 8_192);

        let lower_request = responses_request_to_chat_completions(
            &json!({
                "model": "deepseek-chat",
                "input": "hello",
                "max_output_tokens": 4_096
            }),
            Some(8_192),
        )
        .expect("lower body");
        assert_eq!(lower_request["max_tokens"], 4_096);

        let defaulted = responses_request_to_chat_completions(
            &json!({ "model": "deepseek-chat", "input": "hello" }),
            Some(8_192),
        )
        .expect("defaulted body");
        assert_eq!(defaulted["max_tokens"], 8_192);
    }

    #[test]
    fn chat_completion_response_maps_to_responses_shape() {
        let response = chat_completion_to_response(&json!({
            "id": "chatcmpl_1",
            "created": 123,
            "model": "deepseek-chat",
            "choices": [{
                "message": { "role": "assistant", "content": "pong" }
            }],
            "usage": { "prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3 }
        }));

        assert_eq!(response["object"], "response");
        assert_eq!(response["status"], "completed");
        assert_eq!(response["model"], "deepseek-chat");
        assert_eq!(response["output_text"], "pong");
        assert_eq!(response["output"][0]["content"][0]["text"], "pong");
        assert_eq!(response["usage"]["total_tokens"], 3);
    }

    #[test]
    fn chat_completion_tool_call_maps_to_responses_function_call() {
        let response = chat_completion_to_response(&json!({
            "id": "chatcmpl_tools",
            "model": "deepseek-chat",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_123",
                        "type": "function",
                        "function": {
                            "name": "shell_command",
                            "arguments": "{\"command\":\"pwd\"}"
                        }
                    }]
                }
            }]
        }));

        assert_eq!(response["output"].as_array().map(Vec::len), Some(1));
        assert_eq!(response["output"][0]["type"], "function_call");
        assert_eq!(response["output"][0]["call_id"], "call_123");
        assert_eq!(response["output"][0]["name"], "shell_command");
        assert_eq!(response["output"][0]["arguments"], "{\"command\":\"pwd\"}");
        assert_eq!(response["output_text"], "");
    }

    #[test]
    fn split_next_sse_event_accepts_crlf_and_lf_boundaries() {
        let (first, rest) =
            split_next_sse_event("data: one\r\n\r\ndata: two\n\n").expect("first event");
        assert_eq!(first, "data: one");
        assert_eq!(rest, "data: two\n\n");

        let (second, rest) = split_next_sse_event(&rest).expect("second event");
        assert_eq!(second, "data: two");
        assert!(rest.is_empty());
    }

    #[test]
    fn preserves_utf8_characters_split_across_stream_chunks() {
        let payload = "data: {\"delta\":\"中文\"}\n\n".as_bytes();
        let mut output = String::new();
        let mut pending = Vec::new();

        for byte in payload {
            append_utf8_stream_chunk(&mut output, &mut pending, &[*byte])
                .expect("split UTF-8 remains valid");
        }

        finish_utf8_stream(&pending).expect("stream ends on a character boundary");
        assert_eq!(output, "data: {\"delta\":\"中文\"}\n\n");
        assert!(!output.contains('\u{fffd}'));
    }

    #[test]
    fn provider_gateway_shutdown_closes_listener() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .expect("runtime");
        runtime.block_on(async {
            let gateway = start_provider_gateway(ProviderGatewayConfig {
                upstream_base_url: "https://api.example.com/v1".to_string(),
                upstream_api_key: "sk-test".to_string(),
                max_output_tokens: None,
                supports_thinking: false,
                supports_reasoning_effort: false,
            })
            .await
            .expect("gateway");
            let addr = gateway
                .base_url
                .strip_prefix("http://")
                .and_then(|value| value.strip_suffix("/v1"))
                .expect("gateway address")
                .to_string();

            TcpStream::connect(&addr).await.expect("listener is open");
            gateway.shutdown.send(()).expect("shutdown sent");

            let mut closed = false;
            for _ in 0..20 {
                tokio::time::sleep(Duration::from_millis(10)).await;
                if TcpStream::connect(&addr).await.is_err() {
                    closed = true;
                    break;
                }
            }
            assert!(closed, "gateway listener should close after shutdown");
        });
    }
}
