use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
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
        )
        .await;
    }
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
    write_proxy_response(&mut stream, response).await
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
) -> Result<(), String> {
    let body: Value = serde_json::from_slice(&request.body)
        .map_err(|_| "Gateway Responses request body is not valid JSON".to_string())?;
    let stream_response = body.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let chat_body = responses_request_to_chat_completions(&body, max_output_tokens)?;
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
        headers.push((name.trim().to_string(), value));
    }

    let body_start = header_end + 4;
    let mut body = buffer[body_start..].to_vec();
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

pub(crate) fn responses_request_to_chat_completions(
    body: &Value,
    max_output_tokens: Option<u64>,
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
    copy_function_tools(body, &mut out);
    Ok(out)
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
                let arguments = item
                    .get("arguments")
                    .and_then(Value::as_str)
                    .unwrap_or("{}");
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
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk =
            chunk.map_err(|err| format!("Failed to read chat completions stream: {err}"))?;
        pending.push_str(&String::from_utf8_lossy(&chunk));
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
        build_upstream_url, chat_completion_to_response, gateway_request_is_authorized,
        responses_request_to_chat_completions, split_next_sse_event, start_provider_gateway,
        GatewayRequest, ProviderGatewayConfig,
    };
    use serde_json::json;
    use std::time::Duration;
    use tokio::net::TcpStream;

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
                    "output": "D:/Project/CodexMonitor"
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
        assert_eq!(chat["messages"][1]["role"], "tool");
        assert_eq!(chat["messages"][1]["tool_call_id"], "call_123");
        assert_eq!(chat["messages"][1]["content"], "D:/Project/CodexMonitor");
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
