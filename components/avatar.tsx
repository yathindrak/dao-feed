interface AvatarProps {
  seed?: string;
}

export function generateAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${seed}`;
}

export default function Avatar({ seed }: AvatarProps) {
  const avatarSeed = seed || Math.random().toString();

  return (
    // coinbase doesnt allow next/image
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={generateAvatar(avatarSeed)}
      alt="Avatar"
      className="rounded-full"
    />
  );
}
