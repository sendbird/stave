import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
const GHOSTTY_ICON_URL = `${import.meta.env.BASE_URL}ghostty-icon.png`;
const VSCODE_ICON_URL = `${import.meta.env.BASE_URL}vscode.svg`;
const AMPLIFY_ICON_URL = `${import.meta.env.BASE_URL}amplify-logo.svg`;
const STAVE_ICON_URL = `${import.meta.env.BASE_URL}stave-logo.svg`;

export function StaveIcon(props: { className?: string }) {
  return (
    <img
      src={STAVE_ICON_URL}
      alt=""
      aria-hidden
      className={props.className ?? sx(styles.icon)}
      loading="lazy"
      draggable={false}
    />
  );
}

export function GhosttyIcon(props: { className?: string }) {
  return (
    <img
      src={GHOSTTY_ICON_URL}
      alt=""
      aria-hidden
      className={props.className ?? sx(styles.icon)}
      loading="lazy"
      draggable={false}
    />
  );
}

export function VSCodeIcon(props: { className?: string }) {
  return (
    <img
      src={VSCODE_ICON_URL}
      alt=""
      aria-hidden
      className={props.className ?? sx(styles.icon)}
      loading="lazy"
      draggable={false}
    />
  );
}

export function AmplifyIcon(props: { className?: string }) {
  return (
    <img
      src={AMPLIFY_ICON_URL}
      alt=""
      aria-hidden
      className={props.className ?? sx(styles.wordmark)}
      loading="lazy"
      draggable={false}
    />
  );
}

const styles = stylex.create({icon:{width:16,height:16},wordmark:{height:16,width:"auto"}});
