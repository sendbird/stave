// temporary-migration: repository-persisted-state
/**
 * Maps the persisted app-state keys written before registered projects were
 * renamed to repositories onto their new names, on the rehydrated snapshot and
 * before it is read. The zustand store persists `recentProjects`, `projectPath`
 * and `projectName`; without this, an upgrade would drop the user's repository
 * list and current selection. Remove per config/temporary-migrations.json.
 */
const KEY_MAP: Record<string, string> = {
  recentProjects: "recentRepositories",
  projectPath: "repositoryPath",
  projectName: "repositoryName",
};

export function migrateLegacyRepositoryState(state: Record<string, unknown>) {
  for (const [legacy, current] of Object.entries(KEY_MAP)) {
    if (legacy in state) {
      if (state[current] === undefined) state[current] = state[legacy];
      delete state[legacy];
    }
  }
}
