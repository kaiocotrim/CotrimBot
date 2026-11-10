"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Settings2 } from "lucide-react";
import { downloadGif, readGiphyKey, saveGiphyKey, searchGifs, type GiphyGif } from "@/lib/giphy";
import styles from "./gif-picker.module.css";

export function GifPicker({ onSelect, format = "mp4" }: { onSelect: (file: File) => void; format?: "mp4" | "gif" }) {
  const [key, setKey] = useState(readGiphyKey);
  const [draftKey, setDraftKey] = useState("");
  const [configuring, setConfiguring] = useState(!key);
  const [testing, setTesting] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectionGeneration = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { selectionGeneration.current++; requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (!key || configuring) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const result = await searchGifs(key, query, 0, controller.signal);
        if (controller.signal.aborted) return;
        setItems(result.gifs); setNextOffset(result.nextOffset); setHasMore(result.hasMore);
      } catch (cause) {
        if (!controller.signal.aborted) { setItems([]); setError(cause instanceof Error ? cause.message : "Não foi possível buscar GIFs."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 400 : 0);
    searchRef.current?.focus({ preventScroll: true });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, query, configuring]);

  async function connect() {
    if (!draftKey.trim() || testing) return;
    setTesting(true); setError(null);
    try {
      await searchGifs(draftKey.trim(), "", 0);
      saveGiphyKey(draftKey); setKey(draftKey.trim()); setDraftKey(""); setConfiguring(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao GIPHY."); }
    finally { setTesting(false); }
  }
  async function loadMore() {
    const signal = requestRef.current?.signal;
    if (loading || !hasMore || !signal || signal.aborted) return;
    setLoading(true); setError(null);
    try {
      const result = await searchGifs(key, query, nextOffset, signal);
      if (signal.aborted) return;
      setItems((current) => [...current, ...result.gifs.filter((gif) => !current.some((item) => item.id === gif.id))]); setNextOffset(result.nextOffset); setHasMore(result.hasMore);
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar mais GIFs."); }
    finally { if (!signal.aborted) setLoading(false); }
  }
  async function choose(gif: GiphyGif) {
    if (selecting) return;
    const generation = selectionGeneration.current;
    setSelecting(gif.id); setError(null);
    try { const file = await downloadGif(gif, format); if (generation === selectionGeneration.current) onSelect(file); }
    catch (cause) { if (generation === selectionGeneration.current) setError(cause instanceof Error ? cause.message : "Não foi possível preparar o GIF."); }
    finally { if (generation === selectionGeneration.current) setSelecting(null); }
  }

  return <section className={styles.root} aria-label="Selecionar GIF">
    {configuring ? <div className={styles.setup}>
      <span className={styles.setupIcon}>GIF</span>
      <h3>Conectar ao GIPHY</h3>
      <p>Crie uma aplicação do tipo API no painel do GIPHY e cole a chave abaixo para buscar GIFs.</p>
      <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">Criar chave no GIPHY ↗</a>
      <label className={styles.keyLabel}>Chave da API GIPHY<input type="password" autoComplete="off" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Cole sua chave aqui" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void connect(); } }} /></label>
      <div className={styles.setupActions}><button type="button" disabled={!draftKey.trim() || testing} onClick={() => void connect()}>{testing ? "Testando conexão..." : "Conectar GIPHY"}</button>{key && <button type="button" onClick={() => { setConfiguring(false); setError(null); }}>Voltar</button>}</div>
      <small>A chave fica salva somente neste navegador.</small>
    </div> : <>
      <header className={styles.search}><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Pesquisar GIFs" placeholder="Pesquisar GIFs" maxLength={50} value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Configurar GIPHY" title="Configurar GIPHY" onClick={() => { setConfiguring(true); setError(null); }}><Settings2 size={16} /></button></header>
      <div className={styles.results} aria-busy={loading || selecting !== null}>
        <p className={styles.sectionTitle}>{query.trim() ? "Resultados" : "GIFs em alta"}</p>
        <div className={styles.grid}>{items.map((gif) => <button key={gif.id} type="button" disabled={selecting !== null} onClick={() => void choose(gif)} aria-label={`Escolher GIF: ${gif.title}`} className={styles.gif}>
          {/* As miniaturas são fornecidas pelo catálogo GIPHY. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
          {selecting === gif.id && <span className={styles.preparing}><Loader2 size={22} className="animate-spin" /></span>}
        </button>)}</div>
        {loading && <p role="status" className={styles.status}><Loader2 size={16} className="animate-spin" />Carregando GIFs...</p>}
        {!loading && !items.length && !error && <p role="status" className={styles.status}>Nenhum GIF encontrado. Tente outra busca.</p>}
        {hasMore && !loading && <button type="button" className={styles.more} onClick={() => void loadMore()}>Carregar mais GIFs</button>}
      </div>
      <a className={styles.attribution} href="https://giphy.com/" target="_blank" rel="noreferrer">Powered by GIPHY</a>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
