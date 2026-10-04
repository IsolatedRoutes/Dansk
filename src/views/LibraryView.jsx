import { useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { CategoryPicker } from "../components/CategoryPicker";
import { CheckBadgeIcon, Icon, StarIcon } from "../components/icons";
import { renderInlineMarkdown } from "../components/markdown";
import { CenteredOverlay, EmptyState, Pill, iconBtn, inputStyle, smallBtn } from "../components/ui";
import { GRAMMAR_GROUPS, LEVELS, TYPE_LABEL } from "../data/categories";
import { irregularPluralFactsHint, irregularVerbFactsHint } from "../data/irregulars";
import { apiErrorMessage, callAI } from "../lib/ai/index";
import { WORD_INSIGHT_SYSTEM_PROMPT, knownWordsHint } from "../lib/ai/prompts";
import { speakDanish, speechSupported } from "../lib/speech";
import { parseJSONLoose } from "../lib/text";
import { cardInCategory, wordClassFor } from "../lib/vocabulary";
import { cardKind } from "../data/sentenceCards";

export function LibraryView({ cards, categories, updateCard, deleteCard, onOpenSettings }) {
  const [catFilter, setCatFilter] = useState("all");
  const [levels, setLevels] = useState([]); // none ticked = all
  const [typeFilter, setTypeFilter] = useState("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [knownFilter, setKnownFilter] = useState("all"); // all | known | unknown
  const [originFilter, setOriginFilter] = useState("all"); // all | mine | starter
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [showFilters, setShowFilters] = useState(false);
  const [insightFor, setInsightFor] = useState(null);
  const [insightCache, setInsightCache] = useState({});
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) +
    (levels.length ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (starredOnly ? 1 : 0) +
    (knownFilter !== "all" ? 1 : 0) +
    (originFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setCatFilter("all");
    setLevels([]);
    setTypeFilter("all");
    setStarredOnly(false);
    setKnownFilter("all");
    setOriginFilter("all");
  }

  const filtered = cards.filter((c) => {
    if (catFilter !== "all" && !cardInCategory(c, catFilter)) return false;
    if (levels.length && !levels.includes(c.level)) return false;
    if (typeFilter !== "all" && cardKind(c) !== typeFilter) return false;
    if (starredOnly && !c.starred) return false;
    if (knownFilter === "known" && !c.known) return false;
    if (knownFilter === "unknown" && c.known) return false;
    if (originFilter === "mine" && c.starter) return false;
    if (originFilter === "starter" && !c.starter) return false;
    if (query && !(c.front + c.back).toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const [englishFirst, setEnglishFirst] = useState(false);

  // "en"/"et" are grammatical-gender articles Danish nouns are stored
  // with (e.g. "en hund"), and "a"/"an" are their English equivalents
  // (e.g. "a dog") — strip whichever applies, then skip past any other
  // leading non-letter characters (like the stray "/" in a card whose
  // front is literally "en / et"), so both the sort order and the
  // letter grouping agree on the same real first letter instead of one
  // of them being thrown off by punctuation.
  const sortKey = (word) => {
    const stripped = word.normalize("NFC").replace(/^(en|et|an?)\s+/i, "").trim();
    const match = stripped.match(/[a-zA-ZæøåÆØÅ].*/s);
    const key = match ? match[0] : stripped;
    // Danish collation files "aa" with å (Aarhus would land among the Å
    // words); an invisible break keeps it with the A words.
    return /^aa/i.test(key) ? key[0] + "\u200B" + key.slice(1) : key;
  };
  const sortField = (c) => (englishFirst ? c.back : c.front);
  const sorted = [...filtered].sort((a, b) => {
    const cmp = sortKey(sortField(a)).localeCompare(sortKey(sortField(b)), englishFirst ? "en" : "da");
    return sortDir === "desc" ? -cmp : cmp;
  });

  // Grouped into a collapsible A-Z (or Z-A) index — much less overwhelming
  // to scroll through 1000+ cards than one long flat list. Danish's extra
  // letters (æ, ø, å) sort after z, so they end up their own groups at
  // the appropriate end depending on direction — that's correct Danish
  // collation, not a bug, even though it can look surprising coming from
  // English alphabetical order.
  const letterOf = (word) => {
    const key = sortKey(word);
    return key ? key[0].toUpperCase() : "#";
  };
  const groups = [];
  for (const c of sorted) {
    const letter = letterOf(sortField(c));
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.cards.push(c);
    else groups.push({ letter, cards: [c] });
  }
  const [expandedLetters, setExpandedLetters] = useState(new Set());
  function toggleLetter(letter) {
    setExpandedLetters((prev) => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  const knownCount = cards.filter((c) => c.type === "word" && c.known).length;
  const unknownCount = cards.filter((c) => c.type === "word" && !c.known).length;

  async function openInsight(card) {
    setInsightFor(card.id);
    setInsightError("");
    if (insightCache[card.id]) return;
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + card.front + '"' + (card.back ? " (means: " + card.back + ")" : "") + irregularVerbFactsHint(card.front) + irregularPluralFactsHint(card.front) + knownWordsHint(),
        { maxTokens: 900 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightCache((prev) => ({ ...prev, [card.id]: { forms: parsed.forms || [], explanation: (parsed.explanation || "").trim(), related: Array.isArray(parsed.related) ? parsed.related : [] } }));
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Icon.Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your deck"
          style={{ ...inputStyle, padding: "9px 10px 9px 32px" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={() => setShowFilters((s) => !s)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid " + (activeFilterCount > 0 ? "var(--fjord)" : "var(--line)"),
            background: activeFilterCount > 0 ? "#EEF2F0" : "var(--card)",
            borderRadius: 999,
            padding: "7px 14px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          <Icon.Layers size={13} />
          Filters
          {activeFilterCount > 0 && (
            <span
              style={{
                background: "var(--fjord)",
                color: "#FBFAF7",
                borderRadius: 999,
                minWidth: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                padding: "0 5px",
              }}
            >
              {activeFilterCount}
            </span>
          )}
          {showFilters ? <Icon.ChevronUp size={13} /> : <Icon.ChevronDown size={13} />}
        </button>
        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 999,
            padding: "7px 14px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          {sortDir === "asc" ? "A–Z" : "Z–A"}
          {sortDir === "asc" ? <Icon.ArrowDown size={12} /> : <Icon.ArrowUp size={12} />}
        </button>
        <button
          onClick={() => setEnglishFirst((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 999,
            padding: "7px 13px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            whiteSpace: "nowrap",
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          {englishFirst ? (
            <>
              <span style={{ fontStyle: "italic" }}>English</span> → <span style={{ color: "var(--terracotta)" }}>Dansk</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--terracotta)" }}>Dansk</span> → <span style={{ fontStyle: "italic" }}>English</span>
            </>
          )}
          <Icon.RotateCcw size={11} />
        </button>
      </div>

      {showFilters && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Level</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Pill color="var(--fjord)" active={levels.length === 0} onClick={() => setLevels([])}>
              All levels
            </Pill>
            {LEVELS.map((l) => (
              <Pill
                key={l.id}
                color="var(--fjord)"
                active={levels.includes(l.id)}
                onClick={() => setLevels(levels.includes(l.id) ? levels.filter((x) => x !== l.id) : [...levels, l.id].sort())}
              >
                {l.name}
              </Pill>
            ))}
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Type</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "word", "sentence", "grammar"].map((t) => (
              <Pill key={t} color="var(--terracotta)" active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t === "all" ? "All types" : TYPE_LABEL[t]}
              </Pill>
            ))}
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Progress</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Pill color="var(--terracotta)" active={starredOnly} onClick={() => setStarredOnly(!starredOnly)}>
              ★ Starred
            </Pill>
            <Pill color="var(--sage)" active={knownFilter === "known"} onClick={() => setKnownFilter(knownFilter === "known" ? "all" : "known")}>
              Known ({knownCount})
            </Pill>
            <Pill color="var(--fjord)" active={knownFilter === "unknown"} onClick={() => setKnownFilter(knownFilter === "unknown" ? "all" : "unknown")}>
              Unknown ({unknownCount})
            </Pill>
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Category</div>
          <div style={{ marginBottom: 16 }}>
            <CategoryPicker categories={categories} value={catFilter} onChange={setCatFilter} allowAll withGrammar />
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Show</div>
          <div style={{ display: "flex", gap: 6, marginBottom: activeFilterCount > 0 ? 16 : 0, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All cards" },
              { id: "mine", label: "My cards" },
              { id: "starter", label: "Starter vocabulary" },
            ].map((o) => (
              <Pill key={o.id} color="var(--fjord)" active={originFilter === o.id} onClick={() => setOriginFilter(o.id)}>
                {o.label}
              </Pill>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={smallBtn("#A8A395")}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div>
        {groups.length === 0 ? (
          <EmptyState icon={Icon.Layers} title="No matching cards" body="Try a different filter, or add new cards from the Add tab or Chat." />
        ) : (
          groups.map((g) => (
            <div key={g.letter} style={{ marginBottom: 8 }}>
              <button
                onClick={() => toggleLetter(g.letter)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{g.letter}</span>
                {expandedLetters.has(g.letter) ? <Icon.ChevronUp size={14} color="var(--muted)" /> : <Icon.ChevronDown size={14} color="var(--muted)" />}
              </button>
              {expandedLetters.has(g.letter) && (
                <div style={{ marginTop: 8 }}>
                  {g.cards.map((c) => (
                    <div key={c.id}>
                      <LibraryRow
                        card={c}
                        categories={categories}
                        editing={editingId === c.id}
                        englishFirst={englishFirst}
                        onEdit={() => setEditingId(editingId === c.id ? null : c.id)}
                        onSave={(patch) => {
                          updateCard(c.id, patch);
                          setEditingId(null);
                        }}
                        onToggleStar={() => updateCard(c.id, { starred: !c.starred })}
                        onToggleKnown={() => updateCard(c.id, { known: !c.known })}
                        onToggleIgnored={() => updateCard(c.id, { ignored: !c.ignored })}
                        onDelete={() => deleteCard(c.id)}
                        onExplore={() => openInsight(c)}
                      />
                      {insightFor === c.id && (
                        <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
                          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                            <button aria-label="Close" onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
                              <Icon.X size={16} />
                            </button>
                          </div>
                          {insightLoading ? (
                            <div style={{ textAlign: "center", padding: "16px 0" }}>
                              <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
                            </div>
                          ) : insightError ? (
                            <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
                          ) : (
                            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55 }}>
                              {insightCache[insightFor]?.forms?.length > 0 && (
                                <div style={{ marginBottom: insightCache[insightFor]?.explanation ? 10 : 0 }}>
                                  {insightCache[insightFor].forms.map((f, i) => (
                                    <div key={i} style={{ marginBottom: 3 }}>
                                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {insightCache[insightFor]?.explanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightCache[insightFor].explanation)}</div>}
              {insightCache[insightFor]?.related?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Related words</div>
                  {insightCache[insightFor].related.map((f, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                    </div>
                  ))}
                </div>
              )}
                            </div>
                          )}
                        </CenteredOverlay>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "#B8B3A5", textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>
        Built-in words were chosen with help from the FrequencyWords list by Hermit Dave (CC BY-SA 4.0). All translations are our own.
      </div>
    </div>
  );
}

function LibraryRow({ card, categories, editing, englishFirst, onEdit, onSave, onToggleStar, onToggleKnown, onToggleIgnored, onDelete, onExplore }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [notes, setNotes] = useState(card.notes || "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const catName =
    categories.find((c) => c.id === card.category)?.name ||
    (GRAMMAR_GROUPS.find((g) => g.cls === wordClassFor(card)) || {}).name ||
    "Uncategorized";
  // Grammar cards store an English name in front (e.g. "V2 word order"),
  // not Danish — speaking that through a Danish voice just mangles
  // English phonetically rather than pronouncing anything real. Their
  // examples do contain genuine Danish, so use the first one instead;
  // if there isn't one, there's nothing real to speak, so hide the button.
  const speakableText = card.type === "grammar" ? card.examples && card.examples[0] && card.examples[0].da.replace(/\*/g, "") : card.front;

  if (editing) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
        <input value={front} onChange={(e) => setFront(e.target.value)} autoCapitalize={card.type === "word" ? "none" : "sentences"} style={inputStyle} placeholder="Danish" />
        <input value={back} onChange={(e) => setBack(e.target.value)} autoCapitalize={card.type === "word" ? "none" : "sentences"} style={{ ...inputStyle, marginTop: 6 }} placeholder="English" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, marginTop: 6, minHeight: 50 }} placeholder="Notes (optional)" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => onSave({ front, back, notes })} style={smallBtn("var(--fjord)")}>
            <Icon.Save size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Save
          </button>
          <button onClick={onEdit} style={smallBtn("#A8A395")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--rust)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)", marginBottom: 10 }}>
          Delete <strong>{card.front}</strong>? This can't be undone.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onDelete} style={smallBtn("var(--rust)")}>
            Delete
          </button>
          <button onClick={() => setConfirmingDelete(false)} style={smallBtn("#A8A395")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 8, opacity: card.ignored ? 0.45 : card.known ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{englishFirst ? card.back : card.front}</div>
          <div style={{ fontFamily: "var(--sans)", fontStyle: "italic", fontSize: 13, color: "var(--sage)" }}>{englishFirst ? card.front : card.back}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckBadgeIcon size={15} filled={!!card.known} onClick={onToggleKnown} style={{ cursor: "pointer" }} />
          <StarIcon size={15} filled={!!card.starred} color={card.starred ? "var(--rust)" : "#C9C4B6"} onClick={onToggleStar} style={{ cursor: "pointer" }} />
          <button
            onClick={onToggleIgnored}
            style={{ ...iconBtn, color: card.ignored ? "var(--muted)" : "#C9C4B6" }}
            aria-label={card.ignored ? "Stop ignoring this card" : "Ignore this card in Study"}
          >
            <Icon.EyeOff size={15} />
          </button>
        </div>
      </div>
      {card.notes && <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{card.notes}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)" }}>
          <Icon.Tag size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
          {catName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {speechSupported() && speakableText && (
            <button onClick={() => speakDanish(speakableText)} style={iconBtn} aria-label="Pronounce this">
              <Icon.Volume2 size={15} />
            </button>
          )}
          <button onClick={onExplore} style={iconBtn} aria-label="Explore related words">
            <Icon.Lightbulb size={15} />
          </button>
          <button onClick={onEdit} style={iconBtn} aria-label="Edit card">
            <Icon.Edit3 size={15} />
          </button>
          <button onClick={() => setConfirmingDelete(true)} style={iconBtn} aria-label="Delete card">
            <Icon.Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
