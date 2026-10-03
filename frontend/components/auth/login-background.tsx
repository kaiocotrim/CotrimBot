import Image from "next/image";
import styles from "./login-background.module.css";

// Referência: https://on.design/login. Imagens otimizadas e servidas pelo próprio app.
const columns = [
  [
    { src: "/login/collage-01.webp", height: 535 },
    { src: "/login/collage-02.webp", height: 480 },
    { src: "/login/collage-03.webp", height: 480 },
  ],
  [
    { src: "/login/collage-04.webp", height: 480 },
    { src: "/login/collage-05.webp", height: 480 },
    { src: "/login/collage-06.webp", height: 480 },
  ],
  [
    { src: "/login/collage-07.webp", height: 455 },
    { src: "/login/collage-08.webp", height: 480 },
    { src: "/login/collage-09.webp", height: 480 },
  ],
  [
    { src: "/login/collage-10.webp", height: 360 },
    { src: "/login/collage-11.webp", height: 360 },
    { src: "/login/collage-12.webp", height: 480 },
  ],
] as const;

export function LoginBackground() {
  return (
    <div aria-hidden="true" inert className={styles.background}>
      <div className={styles.collage}>
        <div className={styles.grid}>
          {columns.map((images, columnIndex) => (
            <div className={styles.column} key={columnIndex}>
              <div className={styles.track}>
                {/* Grupos iguais permitem repetir a animação sem saltos. */}
                {[0, 1].map((copy) => (
                  <div className={styles.group} key={copy}>
                    {[...images, ...images].map((image, imageIndex) => (
                      <div className={styles.card} key={`${image.src}-${imageIndex}`}>
                        <Image
                          src={image.src}
                          alt=""
                          width={640}
                          height={image.height}
                          loading="eager"
                          unoptimized
                          draggable={false}
                          className={styles.image}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.shade} />
      <div className={styles.fade} />
    </div>
  );
}
