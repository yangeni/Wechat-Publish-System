export interface DraftPayloadInput {
  title: string;
  author: string;
  digest: string;
  content: string;
  thumbMediaId: string;
  needOpenComment: 0 | 1;
  onlyFansCanComment: 0 | 1;
}

export function buildDraftPayload(input: DraftPayloadInput): Record<string, unknown> {
  return {
    articles: [{
      article_type: "news",
      title: input.title,
      author: input.author,
      digest: input.digest,
      content: input.content,
      thumb_media_id: input.thumbMediaId,
      need_open_comment: input.needOpenComment,
      only_fans_can_comment: input.onlyFansCanComment
    }]
  };
}
