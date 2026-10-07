import { useState } from "react";
import { Icon } from "./icons";
import { CheckRow, inputStyle } from "./ui";
import { GRAMMAR_GROUPS, LEVELS } from "../data/categories";
import { SENTENCES_FILTER } from "../lib/vocabulary";
import { SENTENCES_LABEL } from "../data/sentenceCards";

// Study's category menu. Two ways in: by topic, or by grammar group.
// "Verbs" and "Nouns" can be expanded for a few options; those apply to
// verbs / nouns everywhere, not only inside that group.
const VERB_FORM_CHOICES = [
  { id: "base", label: "Basic form" },
  { id: "present", label: "Present" },
  { id: "past", label: "Past" },
  { id: "perfect", label: "Perfect" },
];

const NOUN_CHOICES = [
  { id: "en", label: "en-words" },
  { id: "et", label: "et-words" },
  { id: "hide", label: "Hide en/et (guess it)" },
];

export const DEFAULT_NOUN_OPTS = ["en", "et"];

export const menuRowStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "10px 12px",
  border: "none",
  background: active ? "#EEF2F0" : "transparent",
  color: "var(--ink)",
  fontFamily: "var(--sans)",
  fontSize: 15,
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 8,
});

const menuHeadingStyle = {
  fontFamily: "var(--sans)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: "12px 12px 4px",
};

// The button + floating panel both menus share.
export function MenuDropdown({ label, open, setOpen, align = "left", width = 320, children }) {
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          cursor: "pointer",
          color: "var(--ink)",
          textAlign: "left",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <Icon.ChevronDown size={14} style={{ flexShrink: 0, color: "var(--muted)" }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            className="popover"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              [align]: 0,
              width: "min(" + width + "px, calc(100vw - 32px))",
              maxHeight: "60vh",
              overflowY: "auto",
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 6,
              zIndex: 41,
            }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export function StudyCategoryMenu({ categories, value, onChange, scope, onChangeScope, ownCount, verbForms, onChangeVerbForms, nounOpts, onChangeNounOpts }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null); // "g:verb" | "g:noun" | null
  const lessons = categories.find((c) => c.id === "grammar-lessons" || c.name === "Grammar Lessons");
  const topics = categories.filter((c) => c !== lessons);
  const categoryName =
    value === "all" ? "" : value === SENTENCES_FILTER ? SENTENCES_LABEL : (GRAMMAR_GROUPS.find((g) => g.id === value) || categories.find((c) => c.id === value) || { name: "" }).name;
  const current = [scope === "mine" ? "My cards" : "", categoryName].filter(Boolean).join(" · ") || "All cards";

  function pick(id) {
    onChange(id);
    setOpen(false);
  }
  function toggleVerbForm(id) {
    const has = verbForms.includes(id);
    if (has && verbForms.length === 1) return; // keep at least one ticked
    onChangeVerbForms(VERB_FORM_CHOICES.map((f) => f.id).filter((f) => (f === id ? !has : verbForms.includes(f))));
  }
  function toggleNounOpt(id) {
    const has = nounOpts.includes(id);
    // keep at least one of en / et ticked
    if (has && id !== "hide" && !nounOpts.includes(id === "en" ? "et" : "en")) return;
    onChangeNounOpts(NOUN_CHOICES.map((f) => f.id).filter((f) => (f === id ? !has : nounOpts.includes(f))));
  }

  function expandable(group, choices, isOn, toggle) {
    const isOpen = expanded === group.id;
    return (
      <div key={group.id}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button style={{ ...menuRowStyle(value === group.id), flex: 1 }} onClick={() => pick(group.id)}>
            {group.name}
          </button>
          <button
            onClick={() => setExpanded(isOpen ? null : group.id)}
            aria-label={isOpen ? "Hide options" : "Show options"}
            style={{
              border: "none",
              background: "none",
              padding: "10px 12px",
              cursor: "pointer",
              color: "var(--muted)",
              display: "flex",
              transform: isOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            <Icon.ChevronDown size={15} />
          </button>
        </div>
        {isOpen && (
          <div style={{ margin: "2px 6px 8px 18px", padding: "4px 10px", borderLeft: "2px solid var(--line)" }}>
            {choices.map((f) => (
              <CheckRow key={f.id} on={isOn(f.id)} label={f.label} onClick={() => toggle(f.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <MenuDropdown label={current} open={open} setOpen={setOpen}>
      {/* Which cards: everything, or only the ones you added. Combines with the category below. */}
      <div style={{ display: "flex", gap: 4, padding: 4, margin: "2px 4px 6px", background: "var(--paper)", borderRadius: 10 }}>
        {[
          { id: "all", label: "All cards" },
          { id: "mine", label: "My cards" + (ownCount ? " · " + ownCount : "") },
        ].map((o) => (
          <button
            key={o.id}
            onClick={() => onChangeScope(o.id)}
            aria-pressed={scope === o.id}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 8,
              padding: "8px 6px",
              fontFamily: "var(--sans)",
              fontSize: 13.5,
              fontWeight: scope === o.id ? 700 : 500,
              background: scope === o.id ? "var(--card)" : "transparent",
              boxShadow: scope === o.id ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
              color: scope === o.id ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <button style={menuRowStyle(value === "all")} onClick={() => pick("all")}>
        Any category
      </button>
      <div style={menuHeadingStyle}>Grammar</div>
      {GRAMMAR_GROUPS.map((g) => {
        if (g.id === "g:verb") return expandable(g, VERB_FORM_CHOICES, (id) => verbForms.includes(id), toggleVerbForm);
        if (g.id === "g:noun") return expandable(g, NOUN_CHOICES, (id) => nounOpts.includes(id), toggleNounOpt);
        return (
          <button key={g.id} style={menuRowStyle(value === g.id)} onClick={() => pick(g.id)}>
            {g.name}
          </button>
        );
      })}
      {lessons && (
        <button style={menuRowStyle(value === lessons.id)} onClick={() => pick(lessons.id)}>
          {lessons.name}
        </button>
      )}
      <button style={menuRowStyle(value === SENTENCES_FILTER)} onClick={() => pick(SENTENCES_FILTER)}>
        {SENTENCES_LABEL}
      </button>
      <div style={menuHeadingStyle}>Topics</div>
      {topics.map((c) => (
        <button key={c.id} style={menuRowStyle(value === c.id)} onClick={() => pick(c.id)}>
          {c.name}
        </button>
      ))}
    </MenuDropdown>
  );
}

// Level checkboxes for Study. None ticked means every level. Cards the
// person added that aren't in the built-in list have no level, so they
// only show when no level is ticked.
export function LevelMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const label =
    value.length === 0 || value.length === LEVELS.length
      ? "All levels"
      : value.length === 1
      ? LEVELS.find((l) => l.id === value[0]).name
      : value.length + " levels";
  function toggle(id) {
    onChange(LEVELS.map((l) => l.id).filter((l) => (l === id ? !value.includes(id) : value.includes(l))));
  }
  return (
    <MenuDropdown label={label} open={open} setOpen={setOpen} align="right" width={230}>
      <div style={{ padding: "4px 12px" }}>
        {LEVELS.map((l) => (
          <CheckRow key={l.id} on={value.includes(l.id)} label={l.name + " (" + l.cefr + ")"} onClick={() => toggle(l.id)} />
        ))}
      </div>
    </MenuDropdown>
  );
}
