"use client";

import { useEffect, useState } from "react";
import { Download } from "@/components/icons/animated-lucide";
import styles from "./login-layout.module.css";

const DOWNLOAD_URL = "https://download1478.mediafire.com/0yxpdfo7iowgUi4BRIe8WVQGyuSbt9jo6Pu4QXjBSCoxxU_94fFdYlNybflcVAfXLirA0alCAITlTo5G8OU5iylPrb5n4A57Uzfih-OMctadVxG4SfPBBxohMYXfA5PsDcm9GEdrOSag3Obhuo_XZ1cNcD29Rlk-OVctKZwdbeHPBPw/00xqgjw0cxjhsc1/CotrimBot-Setup-1.1.0-x64.exe";

export function DesktopDownload() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setVisible(!/Electron\/|CotrimBotDesktop\/|Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  if (!visible) return null;
  return <a className={styles.downloadLink} href={DOWNLOAD_URL}>
    <Download size={16} aria-hidden="true" /> Baixar para Windows (.exe)
  </a>;
}
