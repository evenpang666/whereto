import React, { useState } from 'react';
import { assetUrl } from './urls.js';

export function imageLabel(place, detailed = false) {
  if (place.imageKind === 'unavailable') return '实景照片待补充';
  if (place.imageKind === 'ai-illustration')
    return detailed ? 'AI 生成印象图 · 非实景 · 预置浏览 $0' : 'AI 生成 · 浏览 $0';
  if (place.imageKind === 'illustration') return '景观示意 · 非实景';
  if (place.imageSource?.caption) return place.imageSource.caption;
  if (place.kind === 'city-walk') return detailed ? '城市参考照片 · 非实时影像' : '城市参考图';
  return detailed ? '景点参考配图 · 非实时影像' : '景点参考图';
}

export function PlaceImage({ place, ...props }) {
  const [failedImage, setFailedImage] = useState(null);
  if (!place.image || failedImage === place.image) {
    const message = place.image ? '照片暂时无法加载' : '实景照片待补充';
    return <span className="photo-unavailable" role="img" aria-label={`${place.name}${message}`}>{message}</span>;
  }
  return <img src={assetUrl(place.image)} alt={`${place.name}，${imageLabel(place, true)}`}
    {...props} onError={() => setFailedImage(place.image)} />;
}
