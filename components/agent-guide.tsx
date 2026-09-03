'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Bot, Check, CircleDollarSign, MousePointer2, ShieldCheck, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  SIDE_CAN_DO,
  SIDE_CAPABILITIES,
  SIDE_DEMO_FALLBACK,
  SIDE_DEMO_STEPS,
  SIDE_DOES_NOT_CLAIM,
  findCapabilityExample,
  findCapabilityPrompt,
  resolveSideCapabilities,
  type SideCapabilityCategory,
  type SideCapabilityState,
} from '@/lib/capabilities';

const CATEGORY_LABELS: Record<SideCapabilityCategory, string> = {
  discover: 'Discover',
  market_research: 'Investigate a market',
  trader_research: 'Understand traders',
  shared_research: 'Point + ask',
  monitor: 'Monitor',
  act: 'Act',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as SideCapabilityCategory[];

export function AgentGuide({
  open,
  onClose,
  capabilityState,
}: {
  open: boolean;
  onClose: () => void;
  capabilityState: SideCapabilityState;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resolved = useMemo(() => resolveSideCapabilities(capabilityState), [capabilityState]);
  const available = resolved.filter((capability) => capability.actor !== 'human' && capability.availability === 'available');
  const unlockable = resolved.filter((capability) => capability.actor !== 'human' && capability.availability === 'requires_action');

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <aside className="agent-guide" role="dialog" aria-modal="false" aria-labelledby="agent-guide-title">
      <header className="agent-guide-header">
        <div>
          <span><Bot /> WITH CODEX</span>
          <h2 id="agent-guide-title">Clicks provide context. Codex provides intent.</h2>
          <p>Ask naturally. Side supplies the exact live objects and keeps the result in the interface.</p>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close With Codex guide"><X /></button>
      </header>

      <Tabs defaultValue="capabilities" className="agent-guide-tabs">
        <TabsList variant="line" aria-label="With Codex sections">
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="demo">Demo</TabsTrigger>
        </TabsList>

        <TabsContent value="capabilities" className="agent-guide-content">
          <section className="guide-now" aria-label="Current capabilities">
            <div className="guide-section-heading">
              <span>AVAILABLE NOW</span>
              <b>{available.length}</b>
            </div>
            <div className="guide-command-list">
              {available.slice(0, 6).map((capability) => (
                <article key={capability.id}>
                  <div><strong>{capability.label}</strong><small>{capability.effects[0]}</small></div>
                  {findCapabilityExample(capability, capabilityState.context) && <code>“{findCapabilityExample(capability, capabilityState.context)?.text}”</code>}
                </article>
              ))}
              {!available.length && <p>Open Side with Site Tools to use these capabilities through Codex.</p>}
            </div>
          </section>

          {unlockable.length > 0 && (
            <section className="guide-unlock" aria-label="Unlockable capabilities">
              <div className="guide-section-heading"><span>UNLOCK WITH A CLICK</span><MousePointer2 /></div>
              {unlockable.map((capability) => (
                <article key={capability.id}>
                  <small>{capability.unlockHint}</small>
                  <strong>{capability.label}</strong>
                  {findCapabilityExample(capability, capabilityState.context) && <code>“{findCapabilityExample(capability, capabilityState.context)?.text}”</code>}
                </article>
              ))}
            </section>
          )}

          <section className="guide-catalog" aria-label="All Side capabilities">
            {CATEGORY_ORDER.map((category) => {
              const capabilities = SIDE_CAPABILITIES.filter((capability) => capability.category === category);
              return (
                <div className={`guide-category ${category === 'shared_research' ? 'is-featured' : ''}`} key={category}>
                  <div className="guide-category-heading">
                    <span>{CATEGORY_LABELS[category]}</span>
                    {category === 'shared_research' && <b>V9</b>}
                  </div>
                  {capabilities.map((capability) => (
                    <article key={capability.id}>
                      <div className="guide-capability-title">
                        <strong>{capability.label}</strong>
                        {capability.confirmation === 'human' && <span><CircleDollarSign /> Human confirmation required</span>}
                      </div>
                      <p>{capability.description}</p>
                      {capability.examplePrompts.map((example) => <code key={example.id}>“{example.text}”</code>)}
                      {capability.limitations[0] && <small>{capability.limitations[0]}</small>}
                    </article>
                  ))}
                </div>
              );
            })}
          </section>

          <section className="guide-boundaries">
            <div>
              <h3><Check /> What Codex can do</h3>
              <ul>{SIDE_CAN_DO.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h3><ShieldCheck /> What Side does not claim</h3>
              <ul>{SIDE_DOES_NOT_CLAIM.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="demo" className="agent-guide-content demo-guide">
          <div className="demo-intro">
            <span>V9 RECORDING RUNBOOK</span>
            <p>Start with a meaningful live market already open. Let every Side mutation finish before the next line.</p>
          </div>
          {(['setup', 'hero', 'optional'] as const).map((phase) => (
            <section key={phase} className="demo-phase">
              <div className="guide-section-heading"><span>{phase === 'setup' ? 'SETUP' : phase === 'hero' ? 'HERO INTERACTION' : 'OPTIONAL ENDING'}</span></div>
              {SIDE_DEMO_STEPS.filter((step) => step.phase === phase).map((step) => {
                const example = step.promptId ? findCapabilityPrompt(step.promptId) : null;
                return (
                  <article key={step.id}>
                    <b>{SIDE_DEMO_STEPS.findIndex((candidate) => candidate.id === step.id) + 1}</b>
                    <div>
                      <small>{step.actor === 'say' ? 'SAY' : 'HUMAN ACTION'}</small>
                      {example
                        ? <code>“{example.text}”</code>
                        : step.actor === 'say'
                          ? <code>“{step.instruction}”</code>
                          : <strong>{step.instruction}</strong>}
                      <span>EXPECT</span>
                      <ul>{step.expected.map((expectation) => <li key={expectation}><Check /> {expectation}</li>)}</ul>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
          <aside className="demo-fallback">
            <strong>REHEARSAL FALLBACK</strong>
            <p>{SIDE_DEMO_FALLBACK}</p>
          </aside>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
