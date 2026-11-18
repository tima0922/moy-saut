import { DataTexture, EquirectangularReflectionMapping, LinearFilter, SRGBColorSpace } from 'three';

export function createCarReflections() {
  // A small, shared sky and softbox map for the paint and glazing on lighter presets.
  const width=128,height=64;
  const pixels=new Uint8Array(width*height*4);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const elevation=y/(height-1);
    const azimuth=x/(width-1);
    const sky=Math.max(0,(elevation-.47)*1.8);
    const horizon=Math.exp(-((elevation-.51)**2)/.011);
    const softbox=Math.exp(-((elevation-.72)**2)/.010)*(
      Math.exp(-((azimuth-.21)**2)/.012)+Math.exp(-((azimuth-.68)**2)/.021));
    const i=(y*width+x)*4;
    pixels[i]=Math.min(255,45+84*sky+56*horizon+101*softbox);
    pixels[i+1]=Math.min(255,50+101*sky+58*horizon+108*softbox);
    pixels[i+2]=Math.min(255,58+118*sky+61*horizon+115*softbox);
    pixels[i+3]=255;
  }
  const texture=new DataTexture(pixels,width,height);
  texture.mapping=EquirectangularReflectionMapping;
  texture.minFilter=texture.magFilter=LinearFilter;
  texture.colorSpace=SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}
