/** Idea library paths (§6.12). Kept apart from routes.ts so the library slice stays self-contained. */
export const libraryRoutes = {
  home: "/library",
  map: "/library?view=map",
  place: (key: string) => `/library/${encodeURIComponent(key)}`,
  save: (savedIdeaId: string) => `/library/s/${savedIdeaId}`,
  boards: "/library/boards",
  board: (boardId: string) => `/library/b/${boardId}`,
  /** Shared-board personal link (FR-L14). */
  boardLink: (token: string) => `/b/${token}`,
};
