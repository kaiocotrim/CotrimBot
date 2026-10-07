import Image from "next/image";
import styles from "./login-background.module.css";

const columns = [
  [
    { src: "/login2/collage-02.png", height: 480 },
    { src: "/login2/collage-03.webp", height: 480 },
    { src: "/login2/collage-04.png", height: 480 },
  ],
  [
    { src: "/login2/collage-05.png", height: 480 },
    { src: "/login2/collage-06.png", height: 480 },
    { src: "/login2/collage-07.png", height: 480 },
  ],
  [
    { src: "/login2/collage-08.png", height: 480 },
    { src: "/login2/collage-09.png", height: 480 },
    { src: "/login2/collage-10.png", height: 480 },
  ],
  [
    { src: "/login2/collage-11.png", height: 480 },
    { src: "/login2/collage-12.png", height: 480 },
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
