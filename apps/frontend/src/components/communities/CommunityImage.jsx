export default function CommunityImage({ nombre, url, large = false }) {
  return <span className={`community-image${large ? ' community-image-large' : ''}`} aria-hidden="true">
    {url ? <img src={url} alt="" /> : nombre?.trim().slice(0, 1).toUpperCase() || 'C'}
  </span>;
}
