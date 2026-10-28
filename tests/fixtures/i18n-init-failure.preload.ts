import { plugin } from "bun";

/*
 * Preload for `renderer-recovery-i18n-failure.ts`: every module under
 * `src/i18n/` throws while it evaluates, as if i18n failed to initialize.
 * Registered before the StyleX preload so this loader wins for those files.
 */
plugin({
  name: "simulate-i18n-init-failure",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]i18n[\\/][^\\/]+\.ts$/ }, () => ({
      contents: 'throw new Error("i18n init failed (simulated)");',
      loader: "ts",
    }));
  },
});
