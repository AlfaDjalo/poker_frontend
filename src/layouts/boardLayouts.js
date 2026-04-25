/**
 * boardLayouts.js
 * 
 * Maps layout_name -> node positions and point region hints for CAPBOARD.
 * 
 * positions: array indexed by node index, each entry { x, y } as 0-100 percentages
 *              within the CAPBoard container.
 * 
 * pointRegions: optional array of { name, labelX, labelY } giving where to place
 *                  the point label for each point (matched by index to the points array
 *                  from the backend).
 * 
 *  cardSize: relative card size hint (1.0 = standard). Use smaller values for
 *              layouts with many nodes.
 * 
 *  Adding a new game:
 *      1. Add layout_name to the game's .yaml file
 *      2. Add an entry here with node positions and optional pointRegions
 */

export const BOARD_LAYOUTS = {

      // -------------------------------------------------------
  // Standard single board (holdem, omaha, plo8 etc.)
  // Nodes 0-4: flop(0,1,2), turn(3), river(4)
  // -------------------------------------------------------
    single_board: {
        cardSize: 1.0,
        positions: [
            { x: 10, y: 50 },       // node 0 - flop 1
            { x: 26, y: 50 },       // node 1 - flop 2
            { x: 42, y: 50 },       // node 2 - flop 3
            { x: 62, y: 50 },       // node 3 - turn
            { x: 78, y: 50 },       // node 4 - river
        ],
        pointRegions: [
            { name: "board", labelX: 44, labelY: 88 }
        ]
    },
  // -------------------------------------------------------
  // Double board
  // Board 1: nodes 0-4 (top row)
  // Board 2: nodes 5-9 (bottom row)
  // Layout: flop(0,1,2), turn(3), river(4) | flop(5,6,7), turn(8), river(9)
  // -------------------------------------------------------
  double_board: {
    cardSize: 0.85,
    positions: [
      { x: 10, y: 30 },   // node 0 - board1 flop 1
      { x: 26, y: 30 },   // node 1 - board1 flop 2
      { x: 42, y: 30 },   // node 2 - board1 flop 3
      { x: 62, y: 30 },   // node 3 - board1 turn
      { x: 78, y: 30 },   // node 4 - board1 river
      { x: 10, y: 70 },   // node 5 - board2 flop 1
      { x: 26, y: 70 },   // node 6 - board2 flop 2
      { x: 42, y: 70 },   // node 7 - board2 flop 3
      { x: 62, y: 70 },   // node 8 - board2 turn
      { x: 78, y: 70 },   // node 9 - board2 river
    ],
    pointRegions: [
      { name: "board1", labelX: 44, labelY: 8 },
      { name: "board2", labelX: 44, labelY: 58 },
    ]
  },

  // -------------------------------------------------------
  // Triple board
  // Board 1: nodes 0-4 (top)
  // Board 2: nodes 5-9 (middle)
  // Board 3: nodes 10-14 (bottom)
  // -------------------------------------------------------
  triple_board: {
    cardSize: 0.72,
    positions: [
      { x: 10, y: 18 },  // node 0  - board1 flop 1
      { x: 26, y: 18 },  // node 1  - board1 flop 2
      { x: 42, y: 18 },  // node 2  - board1 flop 3
      { x: 62, y: 18 },  // node 3  - board1 turn
      { x: 78, y: 18 },  // node 4  - board1 river
      { x: 10, y: 50 },  // node 5  - board2 flop 1
      { x: 26, y: 50 },  // node 6  - board2 flop 2
      { x: 42, y: 50 },  // node 7  - board2 flop 3
      { x: 62, y: 50 },  // node 8  - board2 turn
      { x: 78, y: 50 },  // node 9  - board2 river
      { x: 10, y: 82 },  // node 10 - board3 flop 1
      { x: 26, y: 82 },  // node 11 - board3 flop 2
      { x: 42, y: 82 },  // node 12 - board3 flop 3
      { x: 62, y: 82 },  // node 13 - board3 turn
      { x: 78, y: 82 },  // node 14 - board3 river
    ],
    pointRegions: [
      { name: "board1", labelX: 44, labelY: 3 },
      { name: "board2", labelX: 44, labelY: 37 },
      { name: "board3", labelX: 44, labelY: 69 },
    ]
  },

  // -------------------------------------------------------
  // Social Distancing (8-card line)
  // Nodes 0-7 left to right in a single horizontal line.
  // Players must use non-adjacent cards.
  // -------------------------------------------------------
  social_distancing: {
    cardSize: 0.72,
    positions: [
      { x:  6, y: 50 },  // node 0
      { x: 20, y: 50 },  // node 1
      { x: 34, y: 50 },  // node 2
      { x: 48, y: 50 },  // node 3
      { x: 62, y: 50 },  // node 4 (turn 1)
      { x: 76, y: 50 },  // node 5 (turn 2)
      { x: 88, y: 50 },  // node 6 (river 1)
      { x: 96, y: 50 },  // node 7 (river 2)
    ],
    pointRegions: [
      { name: "board", labelX: 50, labelY: 8 }
    ]
  },

  // Social Distancing 9-card variant
  social_distancing_9: {
    cardSize: 0.68,
    positions: [
      { x:  4, y: 50 },
      { x: 15, y: 50 },
      { x: 26, y: 50 },
      { x: 37, y: 50 },
      { x: 48, y: 50 },
      { x: 59, y: 50 },
      { x: 70, y: 50 },
      { x: 81, y: 50 },
      { x: 92, y: 50 },
    ],
    pointRegions: [
      { name: "board", labelX: 50, labelY: 8 }
    ]
  },

  // -------------------------------------------------------
  // Wheel (8 cards evenly spaced in a circle)
  // -------------------------------------------------------
  wheel: {
    cardSize: 0.78,
    positions: (() => {
      // Generate 8 evenly-spaced positions around an ellipse
      // centred at (50, 50), rx=38, ry=38
      const n = 8;
      return Array.from({ length: n }, (_, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        return {
          x: 50 + 38 * Math.cos(angle),
          y: 50 + 38 * Math.sin(angle),
        };
      });
    })(),
    pointRegions: [
      { name: "social_dist", labelX: 50, labelY: 5 },
      { name: "contact_trace", labelX: 50, labelY: 15 },
    ]
  },

  // -------------------------------------------------------
  // Pandemic (3x3 grid)
  // Node numbering: row-major, 0-8
  //   0 1 2
  //   3 4 5
  //   6 7 8
  // -------------------------------------------------------
  grid3x3: {
    cardSize: 0.78,
    positions: [
      { x: 20, y: 20 },  // node 0
      { x: 50, y: 20 },  // node 1
      { x: 80, y: 20 },  // node 2
      { x: 20, y: 50 },  // node 3
      { x: 50, y: 50 },  // node 4
      { x: 80, y: 50 },  // node 5
      { x: 20, y: 80 },  // node 6
      { x: 50, y: 80 },  // node 7
      { x: 80, y: 80 },  // node 8
    ],
    pointRegions: [
      { name: "social_dist",  labelX: 5, labelY: 5 },
      { name: "contact_trace", labelX: 5, labelY: 15 },
    ]
  },

  // -------------------------------------------------------
  // Double Bullseye
  // Vertices(flop): nodes 0,1,2,3
  // Edges(turn):    nodes 4(top),5(right),6(bottom),7(left)
  // Bullseye 2:     node 8
  // Bullseye 1:     node 9 (centre, river)
  //
  //      0   4   1
  //      7   9   5
  //      3   6   2
  //          8   <- second bullseye below
  // -------------------------------------------------------
  double_bullseye: {
    cardSize: 0.82,
    positions: [
      { x: 20, y: 20 },  // node 0 - vertex TL
      { x: 80, y: 20 },  // node 1 - vertex TR
      { x: 80, y: 80 },  // node 2 - vertex BR
      { x: 20, y: 80 },  // node 3 - vertex BL
      { x: 50, y: 20 },  // node 4 - edge top
      { x: 80, y: 50 },  // node 5 - edge right
      { x: 50, y: 80 },  // node 6 - edge bottom
      { x: 20, y: 50 },  // node 7 - edge left
      { x: 50, y: 95 },  // node 8 - 2nd bullseye
      { x: 50, y: 50 },  // node 9 - main bullseye (centre)
    ],
    pointRegions: [
      { name: "main_board", labelX: 5, labelY: 5 },
      { name: "bullseye",   labelX: 5, labelY: 15 },
    ]
  },

  // -------------------------------------------------------
  // Bomba (3x3 main board + 2 river cards below)
  // Columns (pre-flop, flop, turn): 3 vertical cards each
  // River: 2 cards below
  //
  //   col0  col1  col2
  //   0     3     6
  //   1     4     7
  //   2     5     8
  //         9    10   <- river
  // -------------------------------------------------------
  bomba: {
    cardSize: 0.78,
    positions: [
      { x: 20, y: 20 },  // node 0 - col0 top
      { x: 20, y: 50 },  // node 1 - col0 mid
      { x: 20, y: 80 },  // node 2 - col0 bot
      { x: 50, y: 20 },  // node 3 - col1 top
      { x: 50, y: 50 },  // node 4 - col1 mid
      { x: 50, y: 80 },  // node 5 - col1 bot
      { x: 80, y: 20 },  // node 6 - col2 top
      { x: 80, y: 50 },  // node 7 - col2 mid
      { x: 80, y: 80 },  // node 8 - col2 bot
      { x: 35, y: 95 },  // node 9 - river left
      { x: 65, y: 95 },  // node 10 - river right
    ],
    pointRegions: [
      { name: "high", labelX: 5, labelY: 5 },
      { name: "low",  labelX: 5, labelY: 15 },
    ]
  },

  // -------------------------------------------------------
  // Flying Rivers
  // Flop1(0,1), Flop2(2,3) top row
  // Turn1(4,5), Turn2(6,7) middle row
  // River(8,9) bottom row
  // -------------------------------------------------------
  flying_rivers: {
    cardSize: 0.82,
    positions: [
      { x: 15, y: 20 },  // node 0 - flop1 left
      { x: 32, y: 20 },  // node 1 - flop1 right
      { x: 58, y: 20 },  // node 2 - flop2 left
      { x: 75, y: 20 },  // node 3 - flop2 right
      { x: 15, y: 50 },  // node 4 - turn1 left
      { x: 32, y: 50 },  // node 5 - turn1 right
      { x: 58, y: 50 },  // node 6 - turn2 left
      { x: 75, y: 50 },  // node 7 - turn2 right
      { x: 37, y: 80 },  // node 8 - river left
      { x: 54, y: 80 },  // node 9 - river right
    ],
    pointRegions: [
      { name: "board1", labelX: 5, labelY: 5 },
      { name: "board2", labelX: 55, labelY: 5 },
    ]
  },

  // -------------------------------------------------------
  // Funnel
  // Flop1(0,1,2), Flop2(3,4,5), Flop3(6,7,8) top
  // Turn1(9,10), Turn2(11,12) middle
  // River(13) bottom
  // -------------------------------------------------------
  funnel: {
    cardSize: 0.72,
    positions: [
      { x:  8, y: 18 },  // node 0  - flop1 left
      { x: 20, y: 18 },  // node 1  - flop1 mid
      { x: 32, y: 18 },  // node 2  - flop1 right
      { x: 40, y: 18 },  // node 3  - flop2 left
      { x: 50, y: 18 },  // node 4  - flop2 mid
      { x: 60, y: 18 },  // node 5  - flop2 right
      { x: 68, y: 18 },  // node 6  - flop3 left
      { x: 80, y: 18 },  // node 7  - flop3 mid
      { x: 92, y: 18 },  // node 8  - flop3 right
      { x: 25, y: 52 },  // node 9  - turn1 left
      { x: 38, y: 52 },  // node 10 - turn1 right
      { x: 62, y: 52 },  // node 11 - turn2 left
      { x: 75, y: 52 },  // node 12 - turn2 right
      { x: 50, y: 84 },  // node 13 - river
    ],
    pointRegions: [
      { name: "high", labelX: 5, labelY: 5 },
      { name: "low",  labelX: 5, labelY: 15 },
    ]
  },

  // -------------------------------------------------------
  // F1 (double board, shared flop card)
  // Common flop: node 0 (centre top)
  // Board1: turn(1,2), river(3,4)
  // Board2: turn(5,6), river(7,8)
  // -------------------------------------------------------
  f1: {
    cardSize: 0.82,
    positions: [
      { x: 50, y: 10 },  // node 0 - common flop
      { x: 22, y: 35 },  // node 1 - board1 turn 1
      { x: 38, y: 35 },  // node 2 - board1 turn 2
      { x: 22, y: 65 },  // node 3 - board1 river 1
      { x: 38, y: 65 },  // node 4 - board1 river 2
      { x: 62, y: 35 },  // node 5 - board2 turn 1
      { x: 78, y: 35 },  // node 6 - board2 turn 2
      { x: 62, y: 65 },  // node 7 - board2 river 1
      { x: 78, y: 65 },  // node 8 - board2 river 2
    ],
    pointRegions: [
      { name: "board1", labelX: 5,  labelY: 30 },
      { name: "board2", labelX: 65, labelY: 30 },
    ]
  },

  // -------------------------------------------------------
  // Countdown (right-angled triangle, 5 points)
  // Row 0 (4 cards): nodes 0-3
  // Row 1 (3 cards): nodes 4-6
  // Row 2 (2 cards): nodes 7-8
  // Row 3 (1 card):  node 9
  // -------------------------------------------------------
  countdown: {
    cardSize: 0.72,
    positions: [
      { x: 14, y: 15 },  // node 0
      { x: 34, y: 15 },  // node 1
      { x: 54, y: 15 },  // node 2
      { x: 74, y: 15 },  // node 3
      { x: 14, y: 38 },  // node 4
      { x: 34, y: 38 },  // node 5
      { x: 54, y: 38 },  // node 6
      { x: 14, y: 62 },  // node 7
      { x: 34, y: 62 },  // node 8
      { x: 14, y: 85 },  // node 9
    ],
    pointRegions: [
      { name: "line1", labelX: 60, labelY: 10 },
      { name: "line2", labelX: 60, labelY: 33 },
      { name: "line3", labelX: 60, labelY: 57 },
      { name: "line4", labelX: 60, labelY: 80 },
      { name: "hand",  labelX: 60, labelY: 92 },
    ]
  },
};

/**
 *  Returns the layout config for a given layout_name.
 * Falls back to single_board if not found.
 */
export function getLayout(layoutName) {
    return BOARD_LAYOUTS[layoutName] || BOARD_LAYOUTS["single_board"];
}

/**
 *  Returns the card size multiplier for a layout.
 */
export function getCardSize(layoutName) {
    return getLayout(layoutName).cardSize ?? 1.0;
}