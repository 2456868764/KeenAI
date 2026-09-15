type HeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export function Header({ title, subtitle, showBack, onBack }: HeaderProps) {
  return (
    <header className="keenai-header">
      {showBack ? (
        <button type="button" className="keenai-icon-button" aria-label="Back" onClick={onBack}>
          Back
        </button>
      ) : null}
      <div className="keenai-header__copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </header>
  );
}
