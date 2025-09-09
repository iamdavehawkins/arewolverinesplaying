// Cache for Michigan players to avoid repeated API calls
let michiganPlayersCache = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// NFL Team ID mapping (ESPN team IDs)
const NFL_TEAMS = {
    "Arizona Cardinals": { id: 22, abbreviation: "ARI" },
    "Atlanta Falcons": { id: 1, abbreviation: "ATL" },
    "Baltimore Ravens": { id: 33, abbreviation: "BAL" },
    "Buffalo Bills": { id: 2, abbreviation: "BUF" },
    "Carolina Panthers": { id: 29, abbreviation: "CAR" },
    "Chicago Bears": { id: 3, abbreviation: "CHI" },
    "Cincinnati Bengals": { id: 4, abbreviation: "CIN" },
    "Cleveland Browns": { id: 5, abbreviation: "CLE" },
    "Dallas Cowboys": { id: 6, abbreviation: "DAL" },
    "Denver Broncos": { id: 7, abbreviation: "DEN" },
    "Detroit Lions": { id: 8, abbreviation: "DET" },
    "Green Bay Packers": { id: 9, abbreviation: "GB" },
    "Houston Texans": { id: 34, abbreviation: "HOU" },
    "Indianapolis Colts": { id: 11, abbreviation: "IND" },
    "Jacksonville Jaguars": { id: 30, abbreviation: "JAX" },
    "Kansas City Chiefs": { id: 12, abbreviation: "KC" },
    "Las Vegas Raiders": { id: 13, abbreviation: "LV" },
    "Los Angeles Chargers": { id: 24, abbreviation: "LAC" },
    "Los Angeles Rams": { id: 14, abbreviation: "LAR" },
    "Miami Dolphins": { id: 15, abbreviation: "MIA" },
    "Minnesota Vikings": { id: 16, abbreviation: "MIN" },
    "New England Patriots": { id: 17, abbreviation: "NE" },
    "New Orleans Saints": { id: 18, abbreviation: "NO" },
    "New York Giants": { id: 19, abbreviation: "NYG" },
    "New York Jets": { id: 20, abbreviation: "NYJ" },
    "Philadelphia Eagles": { id: 21, abbreviation: "PHI" },
    "Pittsburgh Steelers": { id: 23, abbreviation: "PIT" },
    "San Francisco 49ers": { id: 25, abbreviation: "SF" },
    "Seattle Seahawks": { id: 26, abbreviation: "SEA" },
    "Tampa Bay Buccaneers": { id: 27, abbreviation: "TB" },
    "Tennessee Titans": { id: 10, abbreviation: "TEN" },
    "Washington Commanders": { id: 28, abbreviation: "WSH" }
};

class WolverineTracker {
    constructor() {
        this.currentGames = [];
        this.playingWolverines = [];
        this.allTeams = [];
        this.init();
    }

    async init() {
        try {
            await this.loadAllTeams();
            await this.checkCurrentGames();
            await this.findPlayingWolverines();
            this.displayResults();
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Failed to load NFL data. Please try again later.');
        }
    }

    async checkCurrentGames() {
        try {
            // Use ESPN scoreboard API which is more reliable for current games
            const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
            const data = await response.json();
            
            this.currentGames = [];
    
            // Check games from scoreboard
            if (data.events && data.events.length > 0) {
                for (const event of data.events) {
                    const status = event.status?.type?.name;
                    
                    // Only check games that are currently in progress
                    if (status === 'STATUS_IN_PROGRESS' || 
                        status === 'STATUS_HALFTIME' || 
                        status === 'STATUS_END_PERIOD' ||
                        status === 'STATUS_DELAYED') {
                        
                        this.currentGames.push({
                            id: event.id,
                            name: event.name,
                            shortName: event.shortName,
                            status: event.status,
                            competitors: event.competitions[0].competitors,
                            date: event.date
                        });
                        
                    }
                }
            }

                
        } catch (error) {
            console.error('Error checking current games:', error);
        }
    }


    async loadAllTeams() {
        try {
            const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
            const data = await response.json();
            this.allTeams = data.sports[0].leagues[0].teams;
            } catch (error) {
            console.error('Error loading teams:', error);
            throw error;
        }
    }

    async findPlayingWolverines() {
        this.playingWolverines = [];
        this.gameMatchups = [];

        if (this.currentGames.length === 0) {
            return;
        }

        // Process each game to find Michigan players
        for (const game of this.currentGames) {
            const gameMatchup = {
                gameId: game.id,
                gameName: game.name,
                status: game.status,
                teams: [],
                wolverines: []
            };

            // Process each team in the game
            for (const competitor of game.competitors) {
                const teamId = competitor.team?.id || competitor.id;
                const teamInfo = {
                    id: teamId,
                    name: competitor.team?.displayName || competitor.displayName,
                    abbreviation: competitor.team?.abbreviation || competitor.abbreviation,
                    wolverines: []
                };

                if (teamId) {
                    await this.findMichiganPlayersOnTeam(teamId, teamInfo);
                }

                gameMatchup.teams.push(teamInfo);
            }

            // Collect all wolverines from both teams for this game
            gameMatchup.teams.forEach(team => {
                gameMatchup.wolverines.push(...team.wolverines);
            });

            if (gameMatchup.wolverines.length > 0) {
                this.gameMatchups.push(gameMatchup);
            }
        }

        // Flatten all wolverines for backward compatibility
        this.gameMatchups.forEach(matchup => {
            this.playingWolverines.push(...matchup.wolverines);
        });
    }

    async findMichiganPlayersOnTeam(teamId, teamInfo) {
        try {
            // Get team info
            const team = this.allTeams.find(t => t.team.id.toString() === teamId.toString());
            if (!team) {
                console.warn(`Team not found for ID: ${teamId}`);
                return;
            }

            // Try different roster endpoints
            let athletes = [];
            
            // First try: standard roster endpoint
            try {
                const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;
                const response = await fetch(rosterUrl);
                const data = await response.json();
                
                if (data.athletes && Array.isArray(data.athletes)) {
                    // Process athlete groups
                    for (const group of data.athletes) {
                        if (group.items && Array.isArray(group.items)) {
                            athletes.push(...group.items);
                        }
                    }
                }
            } catch (e) {
            }
            
            // Second try: team endpoint with roster enabled
            if (athletes.length === 0) {
                try {
                    const teamUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}?enable=roster`;
                    const response = await fetch(teamUrl);
                    const data = await response.json();
                    
                    
                    if (data.team?.roster?.athletes) {
                        for (const group of data.team.roster.athletes) {
                            if (group.items && Array.isArray(group.items)) {
                                athletes.push(...group.items);
                            }
                        }
                    }
                } catch (e) {
                }
            }

            if (athletes.length === 0) {
                return;
            }

            // Check each player for Michigan connection
            for (const athlete of athletes) {
                await this.checkPlayerForMichigan(athlete, teamInfo);
            }
            
        } catch (error) {
            console.error(`Error processing team ${teamId}:`, error);
        }
    }

    async checkPlayerForMichigan(athlete, teamInfo) {
        try {
            // Check all players for Michigan connection - removed restrictive filtering
            
            
            // Check if college info is already in the roster data
            let college = null;
            
            // First check: college info from roster (if available)
            if (athlete.college) {
                if (typeof athlete.college === 'string') {
                    college = athlete.college;
                } else if (athlete.college.name) {
                    college = athlete.college.name;
                } else if (athlete.college.displayName) {
                    college = athlete.college.displayName;
                }
            }
            
            // If no college from roster, try API endpoints
            if (!college) {
                // Try athlete bio endpoint
                try {
                    const bioUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${athlete.id}`;
                    const bioResponse = await fetch(bioUrl);
                    if (bioResponse.ok) {
                        const bioData = await bioResponse.json();
                        
                        if (bioData.college) {
                            if (typeof bioData.college === 'string') {
                                college = bioData.college;
                            } else if (bioData.college.$ref) {
                                // College is a reference, fetch it
                                try {
                                    const collegeResponse = await fetch(bioData.college.$ref);
                                    if (collegeResponse.ok) {
                                        const collegeData = await collegeResponse.json();
                                        college = collegeData.name || collegeData.displayName;
                                    }
                                } catch (ce) {
                                }
                            } else {
                                college = bioData.college.name || bioData.college.displayName;
                            }
                        }
                    }
                } catch (e) {
                }
            }
            
            
            if (college && typeof college === 'string') {
                const collegeLower = college.toLowerCase();
                if (collegeLower.includes('michigan') && !collegeLower.includes('michigan state') && !collegeLower.includes('michigan tech') && !collegeLower.includes('western michigan') && !collegeLower.includes('eastern michigan') && !collegeLower.includes('central michigan')) {
                    const wolverine = {
                        name: athlete.displayName,
                        team: teamInfo.name,
                        number: athlete.jersey || 'N/A',
                        position: athlete.position?.abbreviation || 'N/A',
                        college: college,
                        espnId: athlete.id,
                        photoUrl: this.getPlayerPhotoUrl(athlete.id),
                        teamId: teamInfo.id
                    };
                    
                    // Add to team's wolverines array
                    teamInfo.wolverines.push(wolverine);
                }
            } else {
            }
        } catch (error) {
        }
    }

    getPlayerPhotoUrl(espnId) {
        // ESPN player photo URL format
        return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
    }

    getTeamLogoUrl(teamName) {
        const team = NFL_TEAMS[teamName];
        if (team) {
            return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;
        }
        return null;
    }

    async checkPlayerForMichigan(athlete, teamInfo) {
    try {
        // Check all players for Michigan connection - removed restrictive filtering
        
        // Check if college info is already in the roster data
        let college = null;
        
        // First check: college info from roster (if available)
        if (athlete.college) {
            if (typeof athlete.college === 'string') {
                college = athlete.college;
            } else if (athlete.college.name) {
                college = athlete.college.name;
            } else if (athlete.college.displayName) {
                college = athlete.college.displayName;
            }
        }
        
        // If no college from roster, try API endpoints
        if (!college) {
            // Try athlete bio endpoint
            try {
                const bioUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${athlete.id}`;
                const bioResponse = await fetch(bioUrl);
                if (bioResponse.ok) {
                    const bioData = await bioResponse.json();
                    
                    if (bioData.college) {
                        if (typeof bioData.college === 'string') {
                            college = bioData.college;
                        } else if (bioData.college.$ref) {
                            // College is a reference, fetch it
                            try {
                                const collegeResponse = await fetch(bioData.college.$ref);
                                if (collegeResponse.ok) {
                                    const collegeData = await collegeResponse.json();
                                    college = collegeData.name || collegeData.displayName;
                                }
                            } catch (ce) {
                            }
                        } else {
                            college = bioData.college.name || bioData.college.displayName;
                        }
                    }
                }
            } catch (e) {
            }
        }
        
        
        if (college && typeof college === 'string') {
            const collegeLower = college.toLowerCase();
            if (collegeLower.includes('michigan') && !collegeLower.includes('michigan state')) {
                const wolverine = {
                    name: athlete.displayName,
                    team: teamInfo.name,
                    number: athlete.jersey || 'N/A',
                    position: athlete.position?.abbreviation || 'N/A',
                    college: college,
                    espnId: athlete.id,
                    photoUrl: this.getPlayerPhotoUrl(athlete.id),
                    teamId: teamInfo.id
                };
                
                // Add to team's wolverines array
                teamInfo.wolverines.push(wolverine);
            }
        }
    } catch (error) {
        // Error handling for player checking
    }
    }

    displayResults() {
        const loadingElement = document.getElementById('loading');
        const noGamesElement = document.getElementById('no-games');
        const wolverinesMatchupsElement = document.getElementById('wolverines-matchups');
        const noWolverinesElement = document.getElementById('no-wolverines');
        const matchupsContainer = document.getElementById('matchups-container');

        // Hide loading
        loadingElement.style.display = 'none';

        if (this.currentGames.length === 0) {
            noGamesElement.style.display = 'block';
            return;
        }

        // Show wolverines matchups if any found
        if (this.gameMatchups.length > 0) {
            wolverinesMatchupsElement.style.display = 'block';
            matchupsContainer.innerHTML = this.gameMatchups.map(matchup => `
                <div class="matchup-card">
                    <div class="game-header">
                        <h3 class="game-title">${matchup.gameName}</h3>
                        <p class="game-status">${matchup.status?.type?.description || 'In Progress'}</p>
                    </div>
                    
                    <div class="teams-matchup">
                        ${matchup.teams.map(team => `
                            <div class="team-section">
                                <h4 class="team-name">${team.name}</h4>
                                <div class="team-wolverines">
                                    ${team.wolverines.length > 0 ? 
                                        team.wolverines.map(wolverine => `
                                            <div class="wolverine-card">
                                                <div class="player-photo">
                                                    <img src="${wolverine.photoUrl}" alt="${wolverine.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZjNmNGY2Ii8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iMzciIHI9IjEyIiBmaWxsPSIjOWNhM2FmIi8+CjxwYXRoIGQ9Im0yNSA3NWMwLTEzLjgwNyAxMS4xOTMtMjUgMjUtMjVzMjUgMTEuMTkzIDI1IDI1djI1aC01MHoiIGZpbGw9IiM5Y2EzYWYiLz4KPC9zdmc+'">
                                                </div>
                                                <div class="player-info">
                                                    <h5 class="player-name">${wolverine.name}</h5>
                                                    <div class="player-details">
                                                        <span class="player-number">#${wolverine.number}</span>
                                                        <span class="player-position">${wolverine.position}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('') 
                                        : '<p class="no-wolverines-team">No Michigan players</p>'
                                    }
                                </div>
                            </div>
                        `).join('<div class="vs-divider">VS</div>')}
                    </div>
                </div>
            `).join('');
        } else {
            noWolverinesElement.style.display = 'block';
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    new WolverineTracker();
});

// Refresh data every 5 minutes
setInterval(() => {
    location.reload();
}, 5 * 60 * 1000);
