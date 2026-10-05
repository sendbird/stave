import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ads/components/Button";
import { ActionButton } from "@/components/system/ActionButton";
import { OpenPathDialog } from "./OpenPathDialog";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { workspaceWelcomeStyles as styles } from "./workspace-welcome.styles";
import { Trans, useTranslation } from "@/i18n";

const WELCOME_STEP_KEYS = ["outcome", "together", "review"] as const;

export function WorkspaceWelcome() {
  const { t } = useTranslation("workspace");
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="workspace-welcome-title"
      className={sx(styles.root)}
      data-testid="workspace-welcome"
    >
      <div className={sx(styles.column)}>
        <div className={sx(styles.intro)}>
          <p className={sx(styles.eyebrow)}>{t("welcome.eyebrow")}</p>
          <h1
            id="workspace-welcome-title"
            className={sx(styles.title)}
          >
            {t("welcome.title")}
          </h1>
          <p className={sx(styles.lede)}>{t("welcome.lede")}</p>
        </div>
        <div className={sx(styles.action)}>
          <ActionButton weight="primary" size="lg" onClick={() => setOpen(true)}>
            <FolderOpen aria-hidden="true" className={sx(styles.actionIcon)} />
            {t("welcome.openRepository")}
          </ActionButton>
          <p className={sx(styles.actionHint)}>{t("welcome.openRepositoryHint")}</p>
        </div>
        <ol className={sx(styles.steps)}>
          {WELCOME_STEP_KEYS.map((step) => (
            <li key={step}>
              <strong className={sx(styles.stepLead)}>
                {t(`welcome.steps.${step}.lead`)}
              </strong>{" "}
              {t(`welcome.steps.${step}.body`)}
            </li>
          ))}
        </ol>
        <p className={sx(styles.actionHint)}>
          <Trans
            t={t}
            i18nKey="welcome.accountsHint"
            components={{
              link: (
                <Button
                  type="button"
                  size="xs"
                  variant="link"
                  flushInline
                  xstyle={styles.inlineLink}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                        detail: { section: "tooling" },
                      }),
                    )
                  }
                />
              ),
            }}
          />
        </p>
      </div>
      <OpenPathDialog
        open={open}
        onOpenChange={setOpen}
        onSubmitPath={(inputPath) =>
          useAppStore.getState().openRepositoryFromPath({ inputPath })
        }
        onBrowse={async () => {
          await useAppStore.getState().createRepository({});
        }}
      />
    </section>
  );
}
