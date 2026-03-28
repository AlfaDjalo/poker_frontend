import "../css/WinnerBanner.css";

const WinnerBanner = ({ hand, onClose }) => {
    if (!hand?.winners?.length) return null;

    const winners = hand?.winners ?? [];

    return (
        <div className="winner-banner" onClick={onClose}>
            {console.log("Winner banner showing")}
            Winner: {winners.map(w => `Player ${w}`).join(", ")}
            <div className="winner-sub">Click to continue</div>
        </div>
    );
};

export default WinnerBanner;