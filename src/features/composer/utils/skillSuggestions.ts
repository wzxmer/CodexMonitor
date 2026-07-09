type Skill = { name: string; description?: string };

export type SkillSuggestion = {
  name: string;
};

type SkillSuggestionRule = {
  skill: string;
  priority: number;
  patterns: RegExp[];
};

const SKILL_SUGGESTION_RULES: SkillSuggestionRule[] = [
  {
    skill: "code-review",
    priority: 100,
    patterns: [
      /(?:帮我)?看(?:看|下).*(?:问题|bug|坑|风险)/i,
      /(?:检查|排查|审查).*(?:bug|问题|风险|坑|代码)/i,
      /\bcode\s*review\b/i,
      /\breview\s+(?:this|the)\b/i,
    ],
  },
  {
    skill: "task-clarifier",
    priority: 90,
    patterns: [
      /先(?:别|不要).*(?:写代码|实现|改代码)/i,
      /先(?:澄清|明确|分析)(?:一下)?(?:需求|问题|方案)?/i,
      /(?:clarify|requirements?)\s+(?:first|before)/i,
    ],
  },
  {
    skill: "frontend-design",
    priority: 80,
    patterns: [
      /(?:网页|前端|web|website|landing\s*page).*(?:美化|设计|改版|优化\s*ui)/i,
      /(?:ui|界面).*(?:美化|设计|改版)/i,
    ],
  },
  {
    skill: "app-ui-design",
    priority: 70,
    patterns: [
      /(?:客户端|桌面软件|electron|tauri).*(?:美化|设计|改版|优化\s*ui)/i,
      /(?:desktop|client)\s+(?:ui|design)/i,
    ],
  },
];

const EXPLICIT_SKILL_PATTERN = /(^|\s)\$[A-Za-z0-9_-]+(?=\s|$)/;

function normalizeSkillName(value: string) {
  return value.trim().toLowerCase();
}

export function resolveSkillSuggestion(
  text: string,
  skills: Skill[],
): SkillSuggestion | null {
  const normalizedText = text.trim();
  if (!normalizedText || EXPLICIT_SKILL_PATTERN.test(normalizedText)) {
    return null;
  }

  const availableSkills = new Set(
    skills
      .map((skill) => normalizeSkillName(skill.name))
      .filter(Boolean),
  );
  if (availableSkills.size === 0) {
    return null;
  }

  const matchedRule = SKILL_SUGGESTION_RULES
    .filter((rule) => availableSkills.has(normalizeSkillName(rule.skill)))
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalizedText)))
    .sort((a, b) => b.priority - a.priority)[0];

  return matchedRule ? { name: matchedRule.skill } : null;
}

export function buildSkillInsertion(
  text: string,
  cursor: number,
  skillName: string,
) {
  const boundedCursor = Math.min(Math.max(cursor, 0), text.length);
  const before = text.slice(0, boundedCursor);
  const after = text.slice(boundedCursor);
  const prefix = before.length === 0 || /\s$/.test(before) ? "" : " ";
  const suffix = after.length === 0 || /^\s/.test(after) ? "" : " ";
  const insertion = `${prefix}$${skillName}${suffix}`;
  return {
    text: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  };
}
