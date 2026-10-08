import { ExternalLink } from "lucide-react";
import { chatGptLookupUrl } from "../lib/lookup";

/**
 * 用語の横に置く「ChatGPTで調べる」リンク。
 *
 * 必ず新しいタブで開くこと。同じタブで開くと録音画面が閉じ、録音中の文字起こしが
 * 保存されないまま消える。
 */
export default function ChatGptLink({ term }: { term: string }) {
  return (
    <a
      href={chatGptLookupUrl(term)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${term}をChatGPTで調べる（新しいタブで開きます）`}
      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-self hover:underline"
    >
      ChatGPTで調べる
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}
