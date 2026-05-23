import * as cheerio from "cheerio";

const INTERNAL_TERMS = ["DeepResearch", "DRPUB", "DR-RPT", "Gate", "runtime/objects", "来源建卡", "对象总表"];

export interface SanitizerInput {
  html: string;
  imageUrlMap: Map<string, string>;
}

export interface SanitizerResult {
  html: string;
  blockers: string[];
}

function isLocalAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("file://");
}

function isUnsafeUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return normalized.startsWith("javascript:") || normalized.startsWith("data:");
}

function containsInternalTerm(text: string, term: string): boolean {
  if (term === "Gate") return /(^|[^A-Za-z])Gate([^A-Za-z]|$)/.test(text);
  return text.includes(term);
}

export function sanitizeWechatHtml(input: SanitizerInput): SanitizerResult {
  const blockers: string[] = [];
  const $ = cheerio.load(input.html, { xmlMode: false }, false);

  if ($("script").length > 0) blockers.push("script_tag_present");
  $("script").remove();
  $("svg").each(() => {
    blockers.push("svg_tag_present");
  });

  const plainText = $.root().text();
  for (const term of INTERNAL_TERMS) {
    if (containsInternalTerm(plainText, term)) blockers.push(`internal_term:${term}`);
  }

  $("*").each((_, element) => {
    const attributes = $(element).attr();
    for (const attribute of Object.keys(attributes ?? {})) {
      const value = $(element).attr(attribute) ?? "";
      const normalizedAttribute = attribute.toLowerCase();
      if (normalizedAttribute.startsWith("on")) {
        blockers.push(`event_handler:${attribute}`);
        $(element).removeAttr(attribute);
        continue;
      }
      if ((normalizedAttribute === "href" || normalizedAttribute === "src") && isUnsafeUrl(value)) {
        blockers.push(`unsafe_url:${attribute}:${value}`);
        $(element).removeAttr(attribute);
      }
    }
  });

  $("img").each((_, element) => {
    const current = $(element).attr("src") ?? "";
    if (isLocalAbsolutePath(current)) {
      blockers.push(`local_absolute_image_path:${current}`);
      return;
    }
    const mapped = input.imageUrlMap.get(current);
    if (!mapped) {
      blockers.push(`unmapped_image:${current}`);
      return;
    }
    $(element).attr("src", mapped);
  });

  $("[src]").each((_, element) => {
    const value = $(element).attr("src") ?? "";
    if (value.startsWith("file://")) blockers.push(`file_url:${value}`);
  });

  return {
    html: $.html(),
    blockers: [...new Set(blockers)]
  };
}
