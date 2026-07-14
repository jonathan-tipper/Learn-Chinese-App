import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterCardDetails } from "@/components/character-card-details";
import type { CharacterCard } from "@/lib/types";

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: "character-1",
    hanzi: "茶",
    pinyin: "chá",
    english: "tea",
    examples: ["我想喝茶"],
    learnedInSession: true,
    radical: undefined,
    mnemonic: undefined,
    commonWords: [],
    sources: ["vocabulary", "review"],
    ...overrides
  };
}

describe("CharacterCardDetails", () => {
  it("renders known learning context and honest metadata fallbacks", () => {
    const html = renderToStaticMarkup(<CharacterCardDetails card={card()} />);

    expect(html).toContain("茶");
    expect(html).toContain("chá");
    expect(html).toContain("tea");
    expect(html).toContain("我想喝茶");
    expect(html).toContain("Saved from a coach session");
    expect(html).toContain("Radical details aren’t available yet");
    expect(html).toContain("Mnemonic support isn’t available yet");
    expect(html).toContain("Common words aren’t available yet");
  });

  it("renders partial records without inventing pronunciation or meaning", () => {
    const html = renderToStaticMarkup(
      <CharacterCardDetails
        card={card({ pinyin: undefined, english: undefined, examples: [], learnedInSession: false })}
      />
    );

    expect(html).toContain("Pinyin not available");
    expect(html).toContain("Meaning not available");
    expect(html).toContain("No source example is stored for this item yet");
  });
});
