import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatMessage({
  content,
  safeUrl,
}: {
  content: string;
  safeUrl: (value?: string) => string | undefined;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={(value) => safeUrl(value) || ''}
      components={{
        img: () => null,
        a: ({ href, children }) => {
          const url = safeUrl(href);
          return url ? (
            <a
              href={url}
              target={url.startsWith('/') ? undefined : '_blank'}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ) : (
            <span>{children}</span>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
