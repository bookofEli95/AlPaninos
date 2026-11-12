import Image from "next/image";

// A photo in the brand's red, like the St. Thomas sign artwork: black and
// white, tinted with the stamp red. Fills its (positioned) parent.
export default function RedPhoto({
  src,
  alt,
  sizes,
  priority = false,
  position = "50% 50%",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  // Which part of the photo stays in view as it's cropped.
  position?: string;
}) {
  return (
    <div className="absolute inset-0 isolate overflow-hidden">
      <Image src={src} alt={alt} fill priority={priority} sizes={sizes} style={{ objectPosition: position }} className="object-cover contrast-[1.15] grayscale" />
      <div aria-hidden className="absolute inset-0 bg-stamp mix-blend-multiply" />
    </div>
  );
}
