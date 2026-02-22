const _path = require("node:path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const TerserPlugin = require("terser-webpack-plugin");
const PATHS = require("./paths");

module.exports = {
	entry: {
		app: `${PATHS.src}/app.js`,
		background: `${PATHS.src}/background.js`,
	},

	output: {
		filename: "[name].js",
		path: PATHS.build,
		clean: true,
	},

	devtool: "source-map",
	stats: { all: false, errors: true, builtAt: true },

	module: {
		rules: [
			{ test: /\.m?js$/, resolve: { fullySpecified: false } },

			{
				test: /\.css$/i,
				use: [
					{
						loader: MiniCssExtractPlugin.loader,
						options: { publicPath: "" },
					},
					"css-loader",
				],
			},

			// Handle fonts - copy without processing
			{
				test: /\.(woff2?|ttf|eot)$/,
				type: "asset/resource",
				generator: {
					filename: "katex/fonts/[name][ext]",
				},
			},
		],
	},

	plugins: [

		// copy static assets without clobbering build outputs
		new CopyWebpackPlugin({
			patterns: [
				{
					from: "public",
					to: ".",
					noErrorOnMissing: true,
					force: false, // <‑‑ prevents overwrite
				},
				{
					from: "node_modules/katex/dist",
					to: "katex",
					noErrorOnMissing: true,
					force: false,
				},
			],
			options: { concurrency: 8 },
		}),

		new MiniCssExtractPlugin({ filename: "[name].css" }),
	],

	optimization: {
		minimize: true,
		minimizer: [new TerserPlugin({ terserOptions: { output: { ascii_only: true } } })],
	},
};
