const API_BASE_URL = "http://127.0.0.1:8000";
 
// ─────────────────────────────────────────────
// Hand list & detail
// ─────────────────────────────────────────────

export const fetchHands = async ({ limit = 50, offset = 0, variant = null } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (variant) params.append("variant", variant);
    const res = await fetch(`${API_BASE_URL}/replay/hands?${params}`);
    if (!res.ok) throw new Error("Failed to fetch hand list");
    return res.json();
};

export const fetchHand = async (handId) => {
  const res = await fetch(`${API_BASE_URL}/replay/hands/${handId}`);
  if (!res.ok) throw new Error("Failed to fetch hand ${handId}");
  return res.json();
};
 
export const fetchVariants = async () => {
  const res = await fetch(`${API_BASE_URL}/replay/variants`);
  if (!res.ok) throw new Error("Failed to fetch variants");
  return res.json();
};

// ─────────────────────────────────────────────
// Annotations
// ─────────────────────────────────────────────

export const fetchAnnotations = async (handId) => {
    const res = await fetch(`${API_BASE_URL}/replay/hands/${handId}/annotations`);
    if (!res.ok) throw new Error("Failed to fetch annotations");
    return res.json();
};
 
export const createAnnotation = async (handId, { actionId, comment, selectedCards }) => {
    const res = await fetch(`${API_BASE_URL}/replay/hands/${handId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_id: actionId ?? null,
            comment,
            selected_cards: selectedCards ?? [],
        }),
    });
    if (!res.ok) throw new Error("Failed to create annotation");
    return res.json();
};
 
export const updateAnnotation = async (annotationId, { comment, selectedCards }) => {
    const res = await fetch(`${API_BASE_URL}/replay/annotations/${annotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            comment,
            selected_cards: selectedCards,
        }),
    });
    if (!res.ok) throw new Error("Failed to update annotation");
    return res.json();
};
 
export const deleteAnnotation = async (annotationId) => {
    const res = await fetch(`${API_BASE_URL}/replay/annotations/${annotationId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete annotation");
};
