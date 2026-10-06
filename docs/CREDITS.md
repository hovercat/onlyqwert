# Credits

onlyqwert is a non commercial fan project. Pokémon and all related names and artwork are trademarks and copyrights of Nintendo, Game Freak and The Pokémon Company. This project is not affiliated with or endorsed by them.

## Sprites

Front sprites in `assets/sprites/` come from the [PokeAPI/sprites](https://github.com/PokeAPI/sprites) repository (`sprites/pokemon/{id}.png`). They are the original game artwork owned by their respective rights holders and are used here as fan content only. No Radical Red set with a stable, downloadable per id source was found, so PokeAPI sprites are used. Sprites are trimmed to their alpha bounds by `scripts/make-masks.ts`.

## Names and data

English species names are taken from the [PokeAPI](https://github.com/PokeAPI/pokeapi) CSV data (`pokemon_species_names.csv`), fetched by `scripts/build-pokemon-data.ts`.

## Masks

Silhouette masks in `assets/masks/` are generated locally from the sprite alpha channel.
