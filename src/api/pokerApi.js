const API_BASE_URL = "http://127.0.0.1:8000"

function wrapCards(cardStrings) {
    return (cardStrings || []).map(card => ({
        card,
        hidden: false,
        selected: false
    }));
}

function normalizePlayers(playersArray) {
    const bySeat = {};
    (playersArray || []).forEach(p => {
        bySeat[p.seat] = {
            ...p,
            hand: wrapCards(p.hand || [])
        };
    });
    return bySeat;
}

function formatHandData(rawHand) {
    return {
        ...rawHand,
        board: wrapCards(rawHand.board || []),
        nodes: wrapCards(rawHand.nodes || []),
        points: rawHand.point || [],
        layout_name: rawHand.layout_name || null,
        game_name: rawHand.game_name || null,
        street_names: rawHand.street_names || null,
        players: normalizePlayers(rawHand.players || []),
    };
}

export const getVariants = async () => {
    const response = await fetch(`${API_BASE_URL}/game/variants`);
    if (!response.ok) throw new Error('Failed to fetch variants');
    return response.json();
}

export const selectGame = async (gameName) => {
    const response = await fetch(`${API_BASE_URL}/game/select-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName })
    });
    if (!response.ok) throw new Error('Failed to select game variant');
    return response.json();
};

export const startNewHand = async (gameName = null) => {
    const response = await fetch(`${API_BASE_URL}/game/new-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName }),
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const restart = async (gameName = null) => {
    const response = await fetch(`${API_BASE_URL}/game/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: gameName })
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const sendAction = async(type, amount = null) => {
    const response = await fetch(`${API_BASE_URL}/game/action`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ type, amount })
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const rawHand = await response.json();
    return formatHandData(rawHand);
};
