import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * Phase O — Tiny SEO helper: sets <title>, meta description and OG tags.
 * Use as <Seo title="..." description="..." /> at the top of any page.
 */
export const Seo: React.FC<{
  title: string;
  description?: string;
  image?: string;
}> = ({ title, description, image }) => (
  <Helmet>
    <title>{title} · FinalStore</title>
    {description && <meta name="description" content={description} />}
    <meta property="og:title" content={title} />
    {description && <meta property="og:description" content={description} />}
    {image && <meta property="og:image" content={image} />}
    <meta property="og:type" content="website" />
  </Helmet>
);
