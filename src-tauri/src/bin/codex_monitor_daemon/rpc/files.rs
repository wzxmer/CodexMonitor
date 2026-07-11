use super::*;
use crate::codex::home::resolve_settings_codex_home;
use crate::shared::message_reference_core::{
    create_message_reference_core, CreateMessageReferenceRequest,
};

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    if method != "create_message_reference" {
        return None;
    }
    let request = match serde_json::from_value::<CreateMessageReferenceRequest>(params.clone()) {
        Ok(request) => request,
        Err(error) => return Some(Err(format!("invalid message reference request: {error}"))),
    };
    let settings = state.app_settings.lock().await.clone();
    let codex_home = match resolve_settings_codex_home(&settings) {
        Some(path) => path,
        None => return Some(Err("Unable to resolve CODEX_HOME".to_string())),
    };
    Some(
        create_message_reference_core(&codex_home, request)
            .and_then(|response| serde_json::to_value(response).map_err(|error| error.to_string())),
    )
}
