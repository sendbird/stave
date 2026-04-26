const GHOSTTY_ICON_URL = `${import.meta.env.BASE_URL}ghostty-icon.png`;
const VSCODE_ICON_URL = `${import.meta.env.BASE_URL}vscode-icon.png`;

export function GhosttyIcon(props: { className?: string }) {
  return (
    <img
      src={GHOSTTY_ICON_URL}
      alt=""
      aria-hidden
      className={props.className ?? "size-4"}
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
      className={props.className ?? "size-4"}
      loading="lazy"
      draggable={false}
    />
  );
}
