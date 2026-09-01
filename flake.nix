{
  description = "Is An AI Environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs = { self, nixpkgs }: 
  let
    pkgs = import nixpkgs { system = "aarch64-darwin"; };
    bun = pkgs.bun;
  in {
    devShells.aarch64-darwin.default = pkgs.mkShell {
      buildInputs = [
        bun
      ];
      
      shellHook = ''
        echo "Is An AI Environment"
        echo "Enter Bun $(${bun}/bin/bun --version)"
      '';
    };
  };
}

