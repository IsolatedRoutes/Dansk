import { Icon } from "./icons";

export function TabBar({ tab, setTab }) {
  const items = [
    { id: "study", label: "Study", icon: Icon.GraduationCap },
    { id: "chat", label: "Assistant", icon: Icon.MessageCircle },
    { id: "add", label: "Add", icon: Icon.Plus },
    { id: "library", label: "Library", icon: Icon.Layers },
  ];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        background: "var(--card)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        padding: "7px 4px calc(9px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {items.map(({ id, label, icon: IconCmp }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 2px",
              cursor: "pointer",
              color: active ? "var(--rust)" : "#A8A395",
            }}
          >
            <IconCmp size={20} strokeWidth={active ? 2.1 : 1.7} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 11 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
