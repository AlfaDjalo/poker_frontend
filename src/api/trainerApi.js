const API_BASE_URL = "http://127.0.0.1:8000";

// Reads a FastAPI HTTPException's {detail: "..."} body when present, so
// error messages surfaced to the user are the REAL backend failure
// reason (e.g. "ValueError: No legal hero actions...") instead of a
// generic "Failed to fetch X" that gives no clue what actually broke.
async function _errorMessage(res, fallback) {
    try {
        const body = await res.json();
        if (body?.detail) return body.detail;
    } catch (_) {
        // response wasn't JSON — fall through to the generic message
    }
    return fallback;
}

export const fetchTrainerScenarios = async () => {
    const res = await fetch(`${API_BASE_URL}/trainer/scenarios`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer scenarios"));
    return res.json();
};

export const startTrainerScenario = async (scenarioKey) => {
    const res = await fetch(`${API_BASE_URL}/trainer/scenarios/${encodeURIComponent(scenarioKey)}/new`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to start trainer scenario"));
    return res.json();
};

export const fetchTrainerCheckpoints = async (scenarioKey) => {
    const res = await fetch(`${API_BASE_URL}/trainer/scenarios/${encodeURIComponent(scenarioKey)}/checkpoints`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer checkpoints"));
    return res.json();
};

export const selectTrainerCheckpoint = async (scenarioKey, filename) => {
    const res = await fetch(`${API_BASE_URL}/trainer/scenarios/${encodeURIComponent(scenarioKey)}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: filename || null }),
    });
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to select trainer checkpoint"));
    return res.json();
};

export const fetchTrainerState = async () => {
    const res = await fetch(`${API_BASE_URL}/trainer/state`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer state"));
    return res.json();
};

export const sendTrainerAction = async (actionType) => {
    const res = await fetch(`${API_BASE_URL}/trainer/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: actionType }),
    });
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to send trainer action"));
    return res.json();
};

export const resetTrainerScoreboard = async () => {
    const res = await fetch(`${API_BASE_URL}/trainer/scoreboard/reset`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to reset scoreboard"));
    return res.json();
};

export const fetchTrainerGrid = async () => {
    const res = await fetch(`${API_BASE_URL}/trainer/grid`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer hand grid"));
    return res.json();
};

export const fetchTrainerHistoryGrid = async (entryId) => {
    const res = await fetch(`${API_BASE_URL}/trainer/history/${entryId}/grid`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch history hand grid"));
    return res.json();
};

export const fetchTrainerDebug = async (scenarioKey) => {
    const res = await fetch(`${API_BASE_URL}/trainer/debug/${encodeURIComponent(scenarioKey)}`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer debug info"));
    return res.json();
};

export const fetchTrainerLiveDebug = async () => {
    const res = await fetch(`${API_BASE_URL}/trainer/debug/live`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch live trainer debug info"));
    return res.json();
};

export const fetchTrainerHistory = async (entryId) => {
    const res = await fetch(`${API_BASE_URL}/trainer/history/${entryId}`);
    if (!res.ok) throw new Error(await _errorMessage(res, "Failed to fetch trainer history entry"));
    return res.json();
};