'use strict';
/* ============================================================
   Living Math Workspace — shared contracts barrel.

   The single import surface for both the CommonJS server and the
   Vite-bundled client. See ./README.md and
   docs/BOARD_LIVING_WORKSPACE_SPEC.md (§3.4, §5.5).
   ============================================================ */

module.exports = {
  ...require('./constants/elementTypes'),
  ...require('./constants/moveTypes'),
  ...require('./constants/commandTypes'),

  ...require('./schemas/studentMove.schema'),
  ...require('./schemas/workspaceElement.schema'),
  ...require('./schemas/workspaceSnapshot.schema'),
  ...require('./schemas/engagementEvent.schema'),
  ...require('./schemas/presenceCommand.schema'),

  makeValidator: require('./schemas/_validator').makeValidator,

  // P5 — read-only legacy board-command → workspace-element adapter.
  adaptBoardCommands: require('./legacyBoardAdapter').adaptBoardCommands,
};
