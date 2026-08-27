import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import type { ExtractUrlResult, ExtractedContent, ExtractionError } from "../types/extract-url.js";

/**
 * Fetches the HTML content of a URL.
 * Returns the response text or throws on network/HTTP errors.
 */
async function fetchHtml(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (compatible; midnight-fact-checker-utils/0.1.0; +https://github.com/midnightntwrk/midnight-expert)",
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status.toString()} ${response.statusText}`);
	}

	return response.text();
}

/**
 * Extracts readable content from raw HTML using Mozilla Readability.
 * Returns the article title and HTML content, or null if extraction fails.
 */
export function extractReadableContent(
	html: string,
	url: string,
): { title: string; content: string } | null {
	const dom = new JSDOM(html, { url });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();

	if (!article || !article.content) {
		return null;
	}

	return {
		title: article.title ?? "",
		content: article.content,
	};
}

/**
 * Converts HTML content to clean Markdown using Turndown.
 */
export function htmlToMarkdown(html: string): string {
	const turndown = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
	});

	turndown.remove(["script", "style", "nav", "footer", "header"]);

	return turndown.turndown(html);
}

/**
 * Extracts readable content from a single URL and converts it to Markdown.
 */
export async function extractSingleUrl(url: string): Promise<ExtractedContent | ExtractionError> {
	try {
		const html = await fetchHtml(url);
		const readable = extractReadableContent(html, url);

		if (!readable) {
			return { url, error: "Readability could not extract content from the page" };
		}

		const markdown = htmlToMarkdown(readable.content);

		return {
			url,
			title: readable.title,
			markdown,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { url, error: message };
	}
}

/**
 * Extracts readable content from multiple URLs and converts to Markdown.
 * Processes URLs sequentially to avoid overwhelming target servers.
 */
export async function extractUrls(urls: readonly string[]): Promise<ExtractUrlResult> {
	const successes: ExtractedContent[] = [];
	const failures: ExtractionError[] = [];

	for (const url of urls) {
		const result = await extractSingleUrl(url);

		if ("error" in result) {
			failures.push(result);
		} else {
			successes.push(result);
		}
	}

	return { successes, failures };
}
