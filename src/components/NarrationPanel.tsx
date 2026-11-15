import { useEffect, useMemo, useState } from 'react';
import type { NarrationResponse, RaceReportPackage } from '../../shared/types';
import type { AppConfig } from '../api';
import { requestNarration } from '../api';

type NarrationPanelProps = {
  pkg: RaceReportPackage;
  config: AppConfig | null;
  onCitation: (factId: string) => void;
};

function NarrationText({ text, onCitation }: { text: string; onCitation: (factId: string) => void }) {
  const parts = useMemo(() => text.split(/(\[F\d{4}\])/g), [text]);
  return (
    <div className="narration-text">
      {parts.map((part, index) => {
        const match = /^\[(F\d{4})\]$/.exec(part);
        if (!match) return <span key={index}>{part}</span>;
        return (
          <button
            key={`${match[1]}-${index}`}
            type="button"
            className="citation"
            onClick={() => onCitation(match[1])}
            title={`Open ${match[1]} in the evidence table`}
          >
            {match[1]}
          </button>
        );
      })}
    </div>
  );
}

export function NarrationPanel({ pkg, config, onCitation }: NarrationPanelProps) {
  const [endpoint, setEndpoint] = useState(config?.ai.endpoint ?? 'http://127.0.0.1:11434');
  const [model, setModel] = useState(config?.ai.model ?? 'llama3.2');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NarrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, [pkg.race.id]);

  useEffect(() => {
    if (!config) return;
    setEndpoint((current) => (current.trim() ? current : config.ai.endpoint));
    setModel((current) => (current.trim() ? current : config.ai.model));
  }, [config]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await requestNarration({
        raceId: pkg.race.id,
        endpoint: endpoint.trim() || undefined,
        model: model.trim() || undefined,
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The local model request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="narration-view">
      <div className="card narration-intro">
        <div>
          <p className="eyebrow">Optional, off by default</p>
          <h2>Local AI narration</h2>
          <p className="muted">
            The full report, chart, Markdown export and evidence CSV work without any model. This optional step asks a
            model running on your own machine to rewrite the same evidence in a more natural voice. It never receives
            facts that are not already in the evidence table.
          </p>
        </div>
        <div className="narration-badges">
          <span className="badge">Local only</span>
          <span className="badge">Same evidence</span>
          <span className="badge">Citations checked</span>
        </div>
      </div>

      <div className="narration-grid">
        <div className="card narration-form">
          <h3>Connection</h3>
          <p className="muted">
            Ollama is detected at <code>/api/chat</code>; an OpenAI-compatible server is detected at{' '}
            <code>/v1/chat/completions</code>. Only loopback hosts are accepted.
          </p>
          <div className="preset-buttons">
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setEndpoint('http://127.0.0.1:11434');
                setModel('llama3.2');
              }}
            >
              Ollama preset
            </button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setEndpoint('http://127.0.0.1:1234');
                setModel('local-model');
              }}
            >
              LM Studio preset
            </button>
          </div>
          <label className="field">
            Endpoint
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} />
          </label>
          <button type="button" className="button-primary narration-generate" onClick={generate} disabled={loading}>
            {loading ? 'Waiting for the local model…' : 'Generate local narration'}
          </button>
          {loading ? (
            <p className="narration-loading">
              The server is waiting for the model. A local model can take a minute to respond.
            </p>
          ) : null}
          {error ? (
            <div className="alert alert-error">
              <strong>Narration failed.</strong>
              <p>{error}</p>
              <p className="muted">
                The deterministic report above is unaffected. Check that your local server is running and the model is
                installed.
              </p>
            </div>
          ) : null}
        </div>

        <div className="card narration-result">
          <div className="narration-result-heading">
            <h3>Narration</h3>
            {result ? <span className="badge badge-ai">AI-generated · {result.model}</span> : null}
          </div>
          {result ? (
            <>
              <div className="alert alert-warning">
                <strong>AI-generated text.</strong> This narration is optional and may contain wording the evidence does
                not support. The deterministic report above remains the authoritative version. Every citation below was
                checked against the evidence table; {result.warnings.length === 0 ? 'no warnings were raised.' : 'warnings are listed below.'}
              </div>
              {result.warnings.length > 0 ? (
                <ul className="warning-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <NarrationText text={result.text} onCitation={onCitation} />
              <p className="muted narration-meta">
                {result.citedFactIds.length} distinct evidence citations · endpoint {result.endpoint}
              </p>
            </>
          ) : (
            <div className="narration-placeholder">
              <div className="placeholder-orbit" aria-hidden="true" />
              <h4>No narration generated yet</h4>
              <p className="muted">
                The report is already complete. Generate narration only if you want an alternative, model-written
                version of the same facts.
              </p>
              <ul className="narration-points">
                <li>The prompt includes the deterministic draft and a fact index.</li>
                <li>Every factual sentence must cite a fact ID.</li>
                <li>Overtake language is checked against on-track overtake facts.</li>
                <li>Invalid citations are removed and reported as warnings.</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="card narration-footnote">
        <h3>Run a local model</h3>
        <div className="code-grid">
          <div>
            <span>Ollama</span>
            <code>ollama run llama3.2</code>
          </div>
          <div>
            <span>Then</span>
            <code>LOCAL_AI_URL=http://127.0.0.1:11434 LOCAL_AI_MODEL=llama3.2 npm run dev</code>
          </div>
        </div>
        <p className="muted">
          The server refuses non-loopback endpoints. No API key is required, and no race data is sent to a cloud
          provider by this app.
        </p>
      </div>
    </div>
  );
}
