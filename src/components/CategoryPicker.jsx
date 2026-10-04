import { useState } from "react";
import { inputStyle, smallBtn } from "./ui";
import { GRAMMAR_GROUPS, isLessonsCategory } from "../data/categories";
import { SENTENCES_FILTER } from "../lib/vocabulary";

// <option>s for choosing where a new card goes: "No category" first, then
// the topics (Grammar Lessons is reserved for lessons).
export function CategoryOptions({ categories }) {
  return (
    <>
      <option value="">No category</option>
      {categories
        .filter((c) => !isLessonsCategory(c))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
    </>
  );
}

export function CategoryPicker({ categories, value, onChange, allowAll, allowNew, onAddCategory, withGrammar }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function confirmAdd() {
    if (!name.trim()) {
      setAdding(false);
      return;
    }
    const id = onAddCategory(name);
    onChange(id);
    setName("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmAdd();
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="New category name"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={confirmAdd} style={smallBtn("var(--fjord)")}>
          Add
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{ ...inputStyle, appearance: "auto", color: "var(--ink)" }}
    >
      {allowAll && <option value="all">All categories</option>}
      {!allowAll && !withGrammar && <CategoryOptions categories={categories} />}
      {withGrammar ? (
        <>
          <optgroup label="Grammar">
            {GRAMMAR_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            {categories.filter((c) => c.id === "grammar-lessons").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={SENTENCES_FILTER}>Sentences</option>
          </optgroup>
          <optgroup label="Topics">
            {categories.filter((c) => c.id !== "grammar-lessons").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </>
      ) : allowAll ? (
        categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))
      ) : null}
      {allowNew && <option value="__new__">+ New category…</option>}
    </select>
  );
}
