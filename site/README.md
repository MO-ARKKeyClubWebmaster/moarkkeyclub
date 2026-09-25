# MO-ARK District Key Club Website

## GitHub Pages Deployment

1. Create a new GitHub repository (public)
2. Upload all `.html` files to the root of the repo
3. Go to **Settings → Pages**
4. Under "Source", select **Deploy from a branch**
5. Choose `main` branch, `/ (root)` folder
6. Click Save — your site will be live at `https://yourusername.github.io/repo-name/`

## File Structure

```
index.html          ← Homepage
about.html          ← About MO-ARK, History, Mission & Values
our-district.html   ← District Board, Club Directory, Bylaws
newsletters.html    ← All district newsletters
resources.html      ← Club resources, DLC forms, dues info
dlc.html            ← DLC 2026 info + event calendar
contact.html        ← Contact form + social links
```

## Things to Update Before Going Live

- **Social media links**: Search `href="#"` on social icons and replace with real URLs
- **Newsletter folder links**: Replace `href="#"` on newsletter buttons with real Google Drive folder links
- **Resource buttons**: Replace `href="#"` on officer guidebooks, style guide, bylaws PDF, etc.
- **DLC forms**: Replace `href="#"` on all form links with actual form URLs
- **DLC Informational Packet**: Replace the packet button link
- **Calendar**: The DLC page embeds a Google Calendar — update the `src` URL in `dlc.html` to your district's actual calendar embed link
- **Club Directory map**: Update the map embed link in `our-district.html` with your actual Google Maps embed
- **Board photos/emails**: Add real emails under each board card in `our-district.html`
- **Contact form**: Currently shows a success message client-side only. For real form submission, integrate with Formspree (`https://formspree.io`) — free tier works great for GitHub Pages. Replace the button onclick with a `<form action="https://formspree.io/f/YOUR_ID" method="POST">`.

## Custom Domain (optional)

To use a custom domain like `moarkeyclub.org`:
1. Add a `CNAME` file to the repo root containing just your domain name
2. Configure your DNS provider to point to GitHub Pages