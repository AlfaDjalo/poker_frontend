const API_BASE_URL = "http://127.0.0.1:8000"

function wrapCards(cardStrings) {
    return cardStrings.map(card => ({
        card,
        hidden: false,
        selected: false
    }));
}

function formatHandData(rawHand) {
    return {
        ...rawHand,
        players: rawHand.players.map(player => ({
            ...player,
            hand: wrapCards(player.hand || [])
        })),
        board: wrapCards(rawHand.board || [])
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