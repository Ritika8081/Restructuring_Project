"use client";

/**
 * src/components/ui/DocModal.tsx
 *
 * Full-page documentation view with a sticky table-of-contents on the
 * left and a scrollable content area on the right. This makes it easier
 * for new contributors to navigate the docs inside the app.
 */
import React, { useEffect, useRef, useState } from 'react';

type Section = { id: string; title: string };

const SECTIONS: Section[] = [
    { id: 'overview', title: 'Quick overview' },
    { id: 'data', title: 'Data flow & handling' },
    { id: 'workers', title: 'Workers' },
    { id: 'utils', title: 'Utilities & helpers' },
    { id: 'types', title: 'Types' },
    { id: 'lib', title: 'Signal processing library' },
    { id: 'contexts', title: 'Contexts' },
    { id: 'connections', title: 'Connection adapters' },
    { id: 'ui', title: 'UI Components' },
    { id: 'primitives', title: 'UI primitives' },
    { id: 'app', title: 'App entry & styles' },
    { id: 'edits', title: 'Making edits safely' },
    { id: 'next', title: 'Next steps & improvements' },
];

const DocModal: React.FC<{ show: boolean; onClose: () => void }> = ({ show, onClose }) => {
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [active, setActive] = useState<string>('overview');
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!show) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [show, onClose]);

    useEffect(() => {
        if (!contentRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id);
                    }
                });
            },
            { root: contentRef.current, threshold: 0.4 }
        );

        const nodes = Array.from(contentRef.current.querySelectorAll('section[data-id]')) as HTMLElement[];
        nodes.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [show]);

    if (!show) return null;

    const filteredSections = SECTIONS.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()));

    const scrollTo = (id: string) => {
        const el = contentRef.current?.querySelector(`#${id}`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="fixed inset-0 z-[500] flex bg-black bg-opacity-40">
            <div className="m-auto w-[95%] h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 border-b">
                    <h2 className="text-lg font-semibold">Project documentation</h2>
                    <div className="flex items-center gap-3">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter sections..."
                            className="md:hidden px-3 py-1 border rounded text-sm"
                            aria-label="Filter sections"
                        />
                        <button
                            onClick={onClose}
                            aria-label="Close docs"
                            className="px-3 py-1 text-sm bg-gray-100 rounded border border-gray-200 hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="flex h-full">
                    {/* Left: sticky toc */}
                    <aside className="hidden md:block w-64 border-r overflow-auto">
                        <div className="sticky top-0 p-4">
                            <p className="text-sm text-gray-500 mb-2">Contents</p>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full px-2 py-1 border rounded text-sm mb-3"
                                aria-label="Search docs"
                            />
                            <nav className="flex flex-col gap-1">
                                {filteredSections.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => scrollTo(s.id)}
                                        className={`text-left px-2 py-1 rounded ${active === s.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        {s.title}
                                    </button>
                                ))}
                            </nav>
                            <div className="mt-4 text-xs text-gray-500">
                                Tip: press <kbd className="px-1 py-0.5 bg-gray-100 rounded">Esc</kbd> to close
                            </div>
                        </div>
                    </aside>

                    {/* Right: content */}
                    <div ref={contentRef} className="flex-1 overflow-auto p-6">
                        <section id="overview" data-id="overview" className="mb-8">
                            <h3 className="text-xl font-semibold mb-2">Quick overview</h3>
                            <p className="text-sm text-gray-700">
                                This repository is a Next.js + React app used for visualizing
                                and interacting with streaming data (widgets, connections,
                                and analysis workers). UI lives under <code>src/components</code>,
                                pages use the Next.js app router under <code>src/app</code>, and
                                shared logic is under <code>src/lib</code> and <code>src/utils</code>.
                            </p>
                        </section>

                        <section id="data" data-id="data" className="mb-8">
                            <h3 className="text-xl font-semibold mb-2">Data flow & handling</h3>
                            <p className="text-sm text-gray-700 mb-2">
                                Understanding how data flows through the app is essential when
                                adding widgets, changing connection adapters, or modifying
                                signal-processing logic. Below is the current end-to-end flow
                                including recent architecture updates (workers and provider wiring):
                            </p>

                            <ol className="list-decimal ml-6 text-sm text-gray-700 mb-2">
                                <li>
                                    <strong>Connection adapters</strong> (under <code>src/connections</code>)
                                    receive raw bytes/frames from the device (BLE, Serial, or network).
                                    They parse device framing and push normalized sample objects
                                    into the central channel provider.
                                </li>
                                <li>
                                    <strong>ChannelDataProvider</strong> (<code>src/lib/channelDataContext.tsx</code>)
                                    is the canonical pub/sub hub. It maintains bounded per-channel
                                    sliding buffers, applies per-channel filters, and forwards
                                    single-sample messages to per-channel workers for CPU-bound
                                    processing. The provider also coalesces and rate-limits
                                    published widget outputs to avoid UI thrash.
                                </li>
                                <li>
                                    <strong>Per-channel workers</strong> (for example, <code>src/workers/bandpower.worker.ts</code>)
                                    handle FFT, smoothing, Welch-style PSD calculations and band
                                    aggregation off the main thread. Workers accept streaming
                                    single-sample posts and periodically run FFTs, returning
                                    compact band arrays (delta/theta/alpha/beta/gamma) which
                                    the provider republishes under widget ids like
                                    <code>channel-band-ch{`{idx}`}</code>.
                                </li>
                                <li>
                                    <strong>Widgets / UI</strong> subscribe to the provider's
                                    published outputs (widget ids) instead of computing band
                                    powers on the main thread. This reduces UI lag and keeps
                                    visuals consistent (e.g., SpiderPlot and StatisticGraph
                                    show the same canonical band arrays).
                                </li>
                                <li>
                                    <strong>Serialization & state</strong> — widget configuration
                                    and minimal runtime state are serialized for layout persistence.
                                    Types live in <code>src/types/widget.types.ts</code>.
                                </li>
                            </ol>

                            <p className="text-sm text-gray-700">Practical tips and recent best practices:</p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Prefer worker offload for FFT, large-window filters, and PSDs.</li>
                                <li>The provider exposes a publish/subscribe API; subscribe to
                                    published widget ids (e.g., <code>channel-band-ch0</code>).</li>
                                <li>The provider coalesces rapid publishes (PUB_INTERVAL_MS)
                                    and gates debug logging with internal flags to reduce overhead.</li>
                                <li>When troubleshooting, enable per-file LOG flags rather than
                                    leaving verbose logs enabled in production.</li>
                            </ul>
                            <div className="my-4 p-3 rounded border-l-4 border-blue-300 bg-blue-50 text-sm">
                                <strong>Note:</strong>&nbsp;That’s why your approach “looks like” Muse / OpenBCI GUI / OpenVIBE / BrainFlow / EEGLAB — same clean separation of DSP (worker) and presentation (UI).
                            </div>
                            
                            <h4 className="text-lg font-semibold mt-4">✔ Best scalable pattern (Used in Node-RED, LabVIEW, MaxMSP, BioSignal tools)</h4>
                            <p className="text-sm text-gray-700">Signal routing is per-channel, not per-node.</p>
                            <p className="text-sm text-gray-700">Meaning:</p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Every processing node consumes one channel.</li>
                                <li>If a user wants 4 channels → they drag 4 BandPower nodes (one per channel).</li>
                            </ul>

                            <p className="text-sm text-gray-700">This avoids:</p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Cross-channel interference</li>
                                <li>Timing mismatches</li>
                                <li>Buffer alignment issues</li>
                                <li>UI complexity</li>
                                <li>Routing errors</li>
                            </ul>

                            <p className="text-sm text-gray-700">Why this is good for our application:</p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Clarity & single responsibility: each processing node handles one channel, making it easy to reason about state and behavior.</li>
                                <li>Independent timing & buffers: per-channel nodes use their own buffers and internal state, avoiding accidental misalignment when channels start or stop.</li>
                                <li>Easy debugging and configuration: users can tweak band, window, or filter settings per-channel without affecting others.</li>
                                <li>Scalable UI: the flow and dashboard stay predictable — adding or removing channels is explicit and localized.</li>
                                <li>Compatibility with existing architecture: our provider already applies per-channel filters and widgets prefer published outputs from single-source nodes, so this pattern maps naturally to the codebase.</li>
                            </ul>

                            <p className="text-sm text-gray-700">Recommendation: favor one processing node per channel for most use-cases; only consolidate into multi-channel nodes when you need tight, optimized, or algorithmically coupled multi-channel processing (e.g., beamforming, PCA).</p>
                            
                            <h4 className="text-lg font-semibold mt-4">Widget-to-widget connections (flowchart)</h4>
                            <p className="text-sm text-gray-700">
                                Widgets expose small connection targets (the "input/output circles") in the flow editor. Connecting widgets forwards data from the source widget to the target widget. Typical behaviors:
                            </p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>
                                    <strong>Channel-box → FFT widget</strong>: the Channel-box emits raw channel frames (for example {`{ channelId, timestamp, samples }`} or a per-sample object). When connected, the FFT widget receives these samples and can post them to a worker for frequency processing.
                                </li>
                                <li>
                                    <strong>Plots-box → FFT widget</strong>: if you connect a Plots-box (which may already supply preprocessed or aggregated data), the FFT widget will receive whatever shape the Plots-box emits — ensure the FFT widget can accept that shape or add an adapter widget to normalize the payload.
                                </li>
                                <li>
                                    <strong>Multiple inputs</strong>: some widgets accept multiple incoming connections. The widget implementation decides how to merge or prioritize inputs (e.g., sum, select first, or display multiple series).
                                </li>
                                <li>
                                    <strong>Disconnecting</strong>: removing a connection should stop the data flow; widget implementations should clean up subscriptions and stop any active processing tied to that connection.
                                </li>
                            </ul>

                            <p className="text-sm text-gray-700">
                                Implementation notes for maintainers:
                            </p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Keep the connection payload shape small and well-documented; prefer a consistent normalized shape across adapters.</li>
                                <li>Use the channel/context pub-sub for global streams; for direct widget-to-widget routing the flow controller should deliver messages to the target widget's input handler.</li>
                                <li>Always unsubscribe and terminate workers when a connection is removed to avoid leaks.</li>
                            </ul>
                        </section>

                        <section id="workers" data-id="workers" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Workers</h3>
                            <p className="text-sm text-gray-700">
                                <code>src/workers/bandpower.worker.ts</code> implements the
                                streaming bandpower pipeline used by the provider. Workers
                                are responsible for buffering single-sample posts, running
                                FFTs every N samples (configurable), computing Welch-style
                                PSDs or simple FFT-derived magnitudes, smoothing (EMA)
                                and returning compact band arrays (delta/theta/alpha/beta/gamma).
                            </p>
                            <p className="text-sm text-gray-700">
                                Key design points:
                            </p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Workers accept streaming samples to minimize main-thread work.</li>
                                <li>FFT instances are reused inside workers to avoid allocation churn.</li>
                                <li>Workers return small, canonical payloads; the provider coalesces
                                    multiple worker messages before publishing to widgets.</li>
                                <li>Keep workers focused and return quickly from message handlers
                                    (enqueue + short debounce) so the browser scheduler isn't blocked.</li>
                            </ul>
                        </section>

                        <section id="utils" data-id="utils" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Utilities & helpers</h3>
                            <p className="text-sm text-gray-700">
                                <code>src/utils/widget.utils.ts</code> includes cross-widget helpers
                                (drag helpers, ID generation, constants). Place utilities here when
                                they're reused by multiple components.
                            </p>
                        </section>

                        <section id="types" data-id="types" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Types</h3>
                            <p className="text-sm text-gray-700">
                                Global TypeScript types live in <code>src/types/widget.types.ts</code>.
                                Keep these updated when changing widget state shapes or props.
                            </p>
                        </section>

                        <section id="lib" data-id="lib" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Signal processing library</h3>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li><code>src/lib/filters.ts</code> — digital filter helpers.</li>
                                <li><code>src/lib/fft.ts</code> — FFT helpers; the implementation has been
                                    simplified (radix-2) and is used both in workers and for small,
                                    read-only visualizations.</li>
                                <li><code>src/lib/bandpower.ts</code> — wrapper/helpers for bandpower metrics; workers and
                                    provider use these helpers to create consistent band outputs.</li>
                                <li><code>src/lib/channelDataContext.tsx</code> — central provider for streaming channel data.
                                    It creates per-channel workers, forwards single-sample posts, and
                                    exposes a publish/subscribe API for widgets. The provider also
                                    coalesces publishes and exposes internal LOG flags to silence
                                    verbose debug output in hot paths.</li>
                            </ul>
                        </section>

                        <section id="contexts" data-id="contexts" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Contexts</h3>
                            <p className="text-sm text-gray-700">
                                <code>src/context/FlowModalContext.tsx</code> controls global modal state
                                for flow configuration. Use this pattern to expose other global UI state.
                            </p>
                        </section>

                        <section id="connections" data-id="connections" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Connection adapters</h3>
                            <p className="text-sm text-gray-700">
                                Connection adapters live under <code>src/connections</code> and include:
                            </p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li><code>BleConnection.tsx</code> — BLE device discovery and streaming.</li>
                                <li><code>SerialConnection.tsx</code> — Web Serial adapter.</li>
                                <li><code>WifiConnection.tsx</code> — Wi‑Fi / network adapters.</li>
                            </ul>
                        </section>

                        <section id="ui" data-id="ui" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">UI Components</h3>
                            <p className="text-sm text-gray-700">Key components are in <code>src/components</code>:</p>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li><code>Header.tsx</code> — top nav (contains Configure Flow + Docs button).</li>
                                <li><code>WidgetPalette.tsx</code> — drag source for widgets.</li>
                                <li><code>DraggableWidget.tsx</code> — drag/resize wrapper.</li>
                                <li><code>BasicGraph.tsx</code>, <code>FFTPlot.tsx</code>, <code>StatisticGraph.tsx</code>, <code>SpiderPlot.tsx</code> — visualizations. Note:
                                    <ul className="list-disc ml-6 text-sm text-gray-700">
                                        <li><code>SpiderPlot.tsx</code> is display-only and consumes the provider's canonical band arrays so it always matches <code>StatisticGraph</code>.</li>
                                        <li>SpiderPlot includes anti-collapse logic (circular-fill) to avoid zero-area polygons and supports an optional throttled console log controlled via props (use sparingly).</li>
                                    </ul>
                                </li>
                                <li><code>ConnectionSelectorWidget.tsx</code> and <code>ConnectionDataWidget.tsx</code> — UI for connection selection and data display.</li>
                            </ul>
                        </section>

                        <section id="primitives" data-id="primitives" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">UI primitives</h3>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li><code>src/components/ui/ConfirmModal.tsx</code> — confirmation modal.</li>
                                <li><code>src/components/ui/Toast.tsx</code> — transient notifications.</li>
                                <li><code>src/components/ui/DocModal.tsx</code> — this file; extract to MDX for easier updates.</li>
                            </ul>
                        </section>

                        <section id="app" data-id="app" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">App entry & styles</h3>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li><code>src/app/layout.tsx</code> — global layout and providers.</li>
                                <li><code>src/app/page.tsx</code> — main canvas page.</li>
                                <li><code>src/app/widgets/page.tsx</code> — optional widgets-focused page.</li>
                                <li><code>src/app/globals.css</code> — global Tailwind / css overrides.</li>
                            </ul>
                        </section>

                        <section id="edits" data-id="edits" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Making edits safely</h3>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Update types in <code>src/types/widget.types.ts</code> when changing widget shapes.</li>
                                <li>Keep heavy computation in <code>src/workers</code> to avoid blocking the UI.</li>
                                <li>Run <code>npm run dev</code> after changes and inspect the terminal for TypeScript errors.</li>
                                <li>Add runtime dependencies to <code>package.json</code> and run <code>npm install</code>.</li>
                            </ul>
                        </section>

                        <section id="next" data-id="next" className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Next steps & improvements</h3>
                            <ul className="list-disc ml-6 text-sm text-gray-700">
                                <li>Consider extracting these docs to an MDX file or a dedicated <code>/docs</code> page for search and editing by non-developers.</li>
                                <li>Add small unit or integration tests for critical utilities.</li>
                                <li>Provide a CONTRIBUTING.md with local setup, running tests, and PR guidelines.</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocModal;
