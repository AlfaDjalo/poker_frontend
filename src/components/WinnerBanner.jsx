import "../css/WinnerBanner.css";

const WinnerBanner = ({ hand }) => {
    if (!hand?.winners?.length) return null;

    return (
        <div className="winner-banner">
            Winner: {hand.winners.join(", ")}
        </div>
    );
};

export default WinnerBanner;