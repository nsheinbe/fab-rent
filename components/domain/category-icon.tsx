import { Icon, type IconName } from "@/components/ui/icons";

const MAP: Record<string, IconName> = { drill: "drill", construction: "construction", leaf: "leaf", tent: "tent", camera: "camera", mountain: "mountain", drop: "drop", truck: "truck", laptop: "laptop", chef: "chef", bike: "bike", speaker: "speaker", stroller: "stroller", trailer: "trailer" };

export function CategoryIcon({ icon, size = 22 }: { icon: string | null | undefined; size?: number }) {
  return <Icon name={MAP[icon ?? ""] ?? "box"} size={size} strokeWidth={1.8} />;
}
