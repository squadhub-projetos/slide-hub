import type { Snippet, SnippetMatch } from '../../types'

/**
 * Resolução de snippets citados em prompts:
 *  - sintaxe explícita: @snippet("A seguir")
 *  - linguagem natural: "adicione uma frase de efeito na parte inferior"
 * Nunca inventa um snippet inexistente — sem correspondência, sem match.
 */

const EXPLICIT = /@snippet\(\s*["“']([^"”']+)["”']\s*\)/g

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreAgainst(snippet: Snippet, needle: string): number {
  const n = normalize(needle)
  if (!n) return 0
  const candidates = [snippet.name, ...snippet.aliases, ...snippet.tags]
  let best = 0
  for (const candidate of candidates) {
    const c = normalize(candidate)
    if (c === n) best = Math.max(best, 1)
    else if (n.includes(c) || c.includes(n)) best = Math.max(best, 0.8)
    else {
      const words = c.split(' ').filter((w) => w.length > 3)
      if (words.length > 0) {
        const hits = words.filter((w) => n.includes(w)).length
        best = Math.max(best, (hits / words.length) * 0.7)
      }
    }
  }
  const desc = normalize(snippet.description)
  const descWords = desc.split(' ').filter((w) => w.length > 4)
  if (descWords.length > 0) {
    const hits = descWords.filter((w) => n.includes(w)).length
    best = Math.max(best, (hits / descWords.length) * 0.5)
  }
  return best
}

/** Encontra snippets citados num texto (explícitos e naturais). */
export function resolveSnippetReferences(text: string, snippets: Snippet[]): SnippetMatch[] {
  const matches: SnippetMatch[] = []
  const used = new Set<string>()

  // 1. Referências explícitas @snippet("...")
  for (const match of text.matchAll(EXPLICIT)) {
    const name = match[1]
    let best: { snippet: Snippet; score: number } | null = null
    for (const snippet of snippets) {
      const score = scoreAgainst(snippet, name)
      if (score > (best?.score ?? 0)) best = { snippet, score }
    }
    if (best && best.score >= 0.6 && !used.has(best.snippet.id)) {
      used.add(best.snippet.id)
      matches.push({ snippet: best.snippet, matchedText: match[0], score: best.score, explicit: true })
    }
  }

  // 2. Linguagem natural — busca frases de intenção
  const normalized = normalize(text)
  const intentPattern = /(adicion\w+|coloq\w+|inser\w+|inclu\w+|use|usar|aplicar|aplique|bota\w+)\s+([^.;!?\n]{4,90})/g
  for (const match of normalized.matchAll(intentPattern)) {
    const phrase = match[2]
    for (const snippet of snippets) {
      if (used.has(snippet.id)) continue
      const score = scoreAgainst(snippet, phrase)
      if (score >= 0.55) {
        used.add(snippet.id)
        matches.push({ snippet, matchedText: phrase.trim(), score, explicit: false })
      }
    }
  }

  return matches.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.score - a.score)
}
