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
        players: normalizePlayers(rawHand.players || []),
    };
}

export const startNewHand = async () => {
    const response = await fetch(`${API_BASE_URL}/game/new-hand`, {
        method: 'POST',
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

export const restart = async () => {
    const response = await fetch(`${API_BASE_URL}/game/restart`, {
        method: 'POST',
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawHand = await response.json();
    return formatHandData(rawHand);
};

// export const dealNextStreet = async () => {
//     const response = await fetch(`${API_BASE_URL}/game/deal_next_street`, {
//         method: 'POST'
//     });
//     if (!response.ok) throw new Error("Network response was not ok");
//     const rawHand = await response.json();
//     return formatHandData(rawHand);
// };

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