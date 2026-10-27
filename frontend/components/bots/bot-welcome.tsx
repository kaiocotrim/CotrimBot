"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import styles from "./bot-welcome.module.css";

function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const motionPreference = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotionPreference = () => false;

export default function BotWelcome() {
  const router = useRouter();
  const reduced = useSyncExternalStore(subscribeToMotionPreference, motionPreference, serverMotionPreference);

  useEffect(() => { router.prefetch("/dashboard/bots/"); }, [router]);
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace("/dashboard/bots/"), reduced ? 0 : 1000);
    return () => window.clearTimeout(timer);
  }, [reduced, router]);

  return <main className={styles.root} aria-busy="true">
    <span className={styles.srOnly} role="status">Abrindo Central de Bots…</span>
    <motion.div className={styles.portal} aria-hidden="true"
      initial={reduced ? false : { scale: .8, opacity: 0 }}
      animate={reduced ? { scale: 1, opacity: 1 } : { scale: [.8, 1, 1.08, 20], opacity: [0, 1, 1, 0] }}
      transition={{ duration: reduced ? 0 : 1, times: [0, .25, .5, 1], ease: "easeInOut" }}>
      <Image src="/Logo-CotrimBot-nova.png" alt="" width={126} height={126} className={styles.logoMark} preload />
    </motion.div>
  </main>;
}
