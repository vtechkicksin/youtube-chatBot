import { useState, type FormEvent } from 'react';

type QuestionResponse = {
  status?: string;
  videoId?: string;
  question?: string;
  answer?: string;
  sources?: string[];
  message?: string | string[];
};

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState<QuestionResponse | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedVideoUrl = videoUrl.trim();
    const trimmedQuestion = question.trim();

    if (!trimmedVideoUrl) {
      setError('Paste a YouTube video link before sending your question.');
      return;
    }

    if (!trimmedQuestion) {
      setError('Write a question before sending it.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setTranscript(null);

    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: trimmedVideoUrl,
          question: trimmedQuestion,
        }),
      });
      const result = (await response.json()) as QuestionResponse;

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join(', ')
          : result.message;
        throw new Error(message ?? 'Could not process this video.');
      }

      if (typeof result.answer !== 'string' || !result.videoId) {
        throw new Error('The server returned an invalid answer response.');
      }

      setTranscript(result);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not connect to the server. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="YouTube Chatbot home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>
            youtube<span className="brand-accent">chat</span>
          </span>
        </a>
        <span className="topbar-note">
          <span className="status-dot" /> Your video companion
        </span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow">
          <span className="eyebrow-line" /> WATCH LESS. UNDERSTAND MORE.
        </div>
        <h1 id="hero-title">
          Every video has
          <br />
          a <span>story to ask.</span>
        </h1>
        <p className="intro">
          Drop in a YouTube link and ask away. We’ll bring the video’s words into focus.
        </p>

        <form className="question-card" onSubmit={handleSubmit}>
          <label htmlFor="videoUrl">YouTube video link</label>
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            maxLength={2048}
            required
          />
          <label htmlFor="question">What would you like to know?</label>
          <textarea
            id="question"
            name="question"
            placeholder="Ask a question about a YouTube video..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={4_900_000}
            rows={4}
            required
          />
          <div className="form-footer">
            <span className="input-hint">Be curious. There are no silly questions.</span>
            <button
              type="submit"
              disabled={isSubmitting || !videoUrl.trim() || !question.trim()}
            >
              {isSubmitting ? 'Finding an answer...' : 'Ask about video'}
              {!isSubmitting && <span aria-hidden="true">↗</span>}
            </button>
          </div>
        </form>

        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {transcript && (
          <section className="transcript-result" aria-live="polite">
            <div className="transcript-heading">
              <div>
                <span className="result-label">ANSWER READY</span>
                <h2>Here’s what the video says</h2>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${transcript.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open video ↗
              </a>
            </div>
            <p className="result-question">
              <strong>Your question:</strong> {transcript.question}
            </p>
            <p className="answer-text">{transcript.answer}</p>
            {!!transcript.sources?.length && (
              <details className="sources">
                <summary>Transcript passages used ({transcript.sources.length})</summary>
                <div className="source-list">
                  {transcript.sources.map((source, index) => (
                    <blockquote key={`${index}-${source.slice(0, 24)}`}>
                      {source}
                    </blockquote>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </section>

      <footer className="page-footer">
        <span>MADE FOR THE CURIOUS</span>
        <span className="footer-decoration" aria-hidden="true">
          ✳
        </span>
        <span>ONE QUESTION AT A TIME</span>
      </footer>
    </main>
  );
}

export default App;
