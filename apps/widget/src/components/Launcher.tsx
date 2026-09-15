type LauncherProps = {
  open: boolean;
  label: string;
  onClick: () => void;
};

export function Launcher({ open, label, onClick }: LauncherProps) {
  return (
    <button
      type="button"
      className="keenai-launcher"
      aria-label={open ? "Close KeenAI messenger" : "Open KeenAI messenger"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
