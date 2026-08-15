import React from "react";
import { useNavigate } from "react-router-dom";
import HandReplayer from "./HandReplayer";

/**
 * TutorialPage
 *
 * Previously rendered its own TutorialHandBrowser + HandReplayer pair,
 * duplicating the browser/replay-pane layout that HandReplayer already
 * has. Now it's just HandReplayer, defaulted to the "hypothetical"
 * source filter with the "+ Create Hand" button enabled — the same
 * component and the same unified HandBrowser used by /replay.
 */
const TutorialPage = () => {
    const navigate = useNavigate();

    return (
        <HandReplayer
            defaultSource="hypothetical"
            showCreateButton={true}
            onCreateHand={() => navigate("/tutorial/create")}
        />
    );
};

export default TutorialPage;