import express, { Request, Response } from "express";
import cors from "cors";
import { getAllPostsMeta, getPostBySlug } from "./blog/blog";
import { getAllProjectsMeta, getProjectBySlug } from "./projects/projects";
import { getAllImages, serveImage } from "./images/images";
import { getStatusBadges } from "./argocd/argocd";
import http from "http";
import { createWsServer } from "./k9s/k9s";
import bl4Router from "./bl4/bl4-api";

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount BL4 save editor API
app.use('/api/bl4', bl4Router);

// Steam profile resolution types
interface SteamProfile {
  steamId: string;
  personaName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  summary?: string;
}

// Helper function to extract profile information from Steam profile HTML
function extractProfileFromHTML(html: string): Partial<SteamProfile> {
  const profile: Partial<SteamProfile> = {};
  
  // Extract profile data from g_rgProfileData JavaScript object
  const profileDataMatch = html.match(/g_rgProfileData\s*=\s*(\{[^;]+\});/);
  if (profileDataMatch) {
    try {
      const profileDataStr = profileDataMatch[1];
      const profileData = JSON.parse(profileDataStr.replace(/\\\//g, '/'));
      
      if (profileData.steamid) profile.steamId = profileData.steamid;
      if (profileData.personaname) profile.personaName = profileData.personaname;
      if (profileData.url) profile.profileUrl = profileData.url;
      if (profileData.summary) profile.summary = profileData.summary;
    } catch (error) {
      console.log('Failed to parse g_rgProfileData, trying alternative methods');
    }
  }
  
  // Alternative: Extract Steam ID from "steamid" field in JSON
  if (!profile.steamId) {
    const steamIdMatch = html.match(/"steamid":"(\d{17})"/);
    if (steamIdMatch) profile.steamId = steamIdMatch[1];
  }
  
  // Extract persona name from page title as fallback
  if (!profile.personaName) {
    const titleMatch = html.match(/<title>Steam Community :: ([^<]+)<\/title>/);
    if (titleMatch) profile.personaName = titleMatch[1];
  }
  
  // Extract avatar URL
  if (!profile.avatarUrl) {
    const avatarMatch = html.match(/<div class="playerAvatar[^"]*"[^>]*>\s*<img src="([^"]+)"/i) ||
                       html.match(/<img[^>]+class="[^"]*playerAvatar[^"]*"[^>]+src="([^"]+)"/i);
    if (avatarMatch) profile.avatarUrl = avatarMatch[1];
  }
  
  return profile;
}

// Helper function to extract profile information from Steam XML
function extractProfileFromXML(xmlText: string): Partial<SteamProfile> {
  const profile: Partial<SteamProfile> = {};
  
  const steamIdMatch = xmlText.match(/<steamID64>(\d+)<\/steamID64>/);
  if (steamIdMatch) profile.steamId = steamIdMatch[1];
  
  const nameMatch = xmlText.match(/<steamID><!\[CDATA\[([^\]]+)\]\]><\/steamID>/);
  if (nameMatch) profile.personaName = nameMatch[1];
  
  const summaryMatch = xmlText.match(/<summary><!\[CDATA\[([^\]]*)\]\]><\/summary>/);
  if (summaryMatch) profile.summary = summaryMatch[1];
  
  const avatarMatch = xmlText.match(/<avatarFull><!\[CDATA\[([^\]]+)\]\]><\/avatarFull>/);
  if (avatarMatch) profile.avatarUrl = avatarMatch[1];
  
  if (profile.steamId) {
    profile.profileUrl = `https://steamcommunity.com/profiles/${profile.steamId}`;
  }
  
  return profile;
}

// Helper function to fetch Steam profile data
async function fetchSteamProfile(profileUrl: string): Promise<Partial<SteamProfile> | null> {
  try {
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      console.log(`Steam profile request failed: ${response.status} for ${profileUrl}`);
      return null;
    }
    
    const html = await response.text();
    return extractProfileFromHTML(html);
  } catch (error) {
    console.log('Failed to fetch Steam profile:', error);
    return null;
  }
}

// Helper function to fetch Steam profile via XML API
async function fetchSteamProfileXML(vanityName: string): Promise<Partial<SteamProfile> | null> {
  try {
    const xmlUrl = `https://steamcommunity.com/id/${encodeURIComponent(vanityName)}?xml=1`;
    const response = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const xmlText = await response.text();
    return extractProfileFromXML(xmlText);
  } catch (error) {
    console.log('XML API request failed:', error);
    return null;
  }
}

// Steam profile resolution endpoint
app.get('/api/steam/resolve-vanity/:input', async (req, res) => {
  try {
    const { input } = req.params;
    
    if (!input || input.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: 'Steam ID or vanity name is required' 
      });
    }
    
    const cleanInput = input.trim();
    let profile: Partial<SteamProfile> | null = null;
    
    // Case 1: Input is already a Steam ID (17 digits starting with 7656119)
    const steamIdMatch = cleanInput.match(/7656119\d{10}/);
    if (steamIdMatch) {
      const steamId = steamIdMatch[0];
      if (/^7656119\d{10}$/.test(steamId)) {
        // Fetch profile info for the Steam ID
        const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
        profile = await fetchSteamProfile(profileUrl);
        
        if (profile && profile.steamId) {
          return res.json({ 
            success: true, 
            steamId: profile.steamId,
            profile: {
              personaName: profile.personaName,
              profileUrl: profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`,
              avatarUrl: profile.avatarUrl,
              summary: profile.summary
            }
          });
        }
        
        // Fallback: return just the Steam ID if profile fetch fails
        return res.json({ 
          success: true, 
          steamId: steamId,
          profile: {
            profileUrl: `https://steamcommunity.com/profiles/${steamId}`
          }
        });
      }
    }
    
    // Case 2: Input is a vanity name - try HTML profile page first
    const profileUrl = `https://steamcommunity.com/id/${encodeURIComponent(cleanInput)}`;
    profile = await fetchSteamProfile(profileUrl);
    
    if (profile && profile.steamId && /^7656119\d{10}$/.test(profile.steamId)) {
      return res.json({ 
        success: true, 
        steamId: profile.steamId,
        profile: {
          personaName: profile.personaName,
          profileUrl: profile.profileUrl || `https://steamcommunity.com/profiles/${profile.steamId}`,
          avatarUrl: profile.avatarUrl,
          summary: profile.summary
        }
      });
    }
    
    // Case 3: Fallback to XML API
    profile = await fetchSteamProfileXML(cleanInput);
    
    if (profile && profile.steamId && /^7656119\d{10}$/.test(profile.steamId)) {
      return res.json({ 
        success: true, 
        steamId: profile.steamId,
        profile: {
          personaName: profile.personaName,
          profileUrl: profile.profileUrl,
          avatarUrl: profile.avatarUrl,
          summary: profile.summary
        }
      });
    }
    
    // No valid Steam profile found
    return res.status(404).json({ 
      success: false, 
      error: 'Steam profile not found. Please check the Steam ID or username.' 
    });
    
  } catch (error) {
    console.error('Steam profile resolution error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resolve Steam profile. Please try again.' 
    });
  }
});

app.get("/api/posts", (req: Request, res: Response) => {
  res.json(getAllPostsMeta());
});

app.get("/api/projects", (req: Request, res: Response) => {
  res.json(getAllProjectsMeta());
});

app.get("/images", (req: Request, res: Response) => {
  res.json(getAllImages());
});

app.get("/api/argocd/badges", (req: Request, res: Response) => {
  getStatusBadges(res);
});

app.get("/api/posts/:slug", (req: Request, res: Response) => {
  const post = getPostBySlug(req.params.slug);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }
  res.json(post);
});

app.get("/api/projects/:slug", (req: Request, res: Response) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

app.get("/images/:filename", (req: Request, res: Response) => {
  serveImage(req, res);
});

// Serve images at /images path with full nested path support
app.get(/^\/images\/(.*)/, (req: Request, res: Response) => {
  // Get the full path after /images/
  const imagePath = req.params[0];
  
  if (!imagePath) {
    return res.status(400).json({ error: 'No image path provided' });
  }
  
  // Set the imagePath for the serveImage function
  req.params.imagePath = imagePath;
  serveImage(req, res);
});

const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`API running on http://0.0.0.0:${PORT}`)
);


createWsServer(server);